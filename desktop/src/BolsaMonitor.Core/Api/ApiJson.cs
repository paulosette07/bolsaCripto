using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

using BolsaMonitor.Core.Alerts;
using BolsaMonitor.Core.Market;
using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Core.Api;

/// <summary>
/// Conversão do JSON de `/api/app/*` nos modelos de domínio.
///
/// Pura de propósito: entra string, sai modelo — sem HttpClient no meio. Isso
/// permite testar o contrato com o servidor (nomes de campo, nulos, datas) sem
/// tocar a rede, e é o que protege o app de uma mudança no payload da web.
///
/// Regras de descarte, herdadas do resto do app: entrada sem preço ou sem
/// ticker é ignorada em vez de virar linha zerada na tela.
/// </summary>
public static class ApiJson
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = true,
        NumberHandling = JsonNumberHandling.AllowReadingFromString
    };

    /// <summary>Cotações de `POST /api/app/quotes`.</summary>
    public static IReadOnlyList<Quote> ParseQuotes(string json)
    {
        var payload = Deserialize<QuotesPayload>(json);
        var quotes = new List<Quote>();

        foreach (var item in payload.Quotes ?? [])
        {
            var quote = ToQuote(item);

            if (quote is not null)
            {
                quotes.Add(quote);
            }
        }

        return quotes;
    }

    /// <summary>
    /// Corpo de `POST /api/app/quotes`: `{ assets: [...], currency }`.
    ///
    /// Fica aqui, e não no serviço, pelo mesmo motivo dos parsers: o formato é
    /// contrato com o servidor e precisa de teste sem rede.
    /// </summary>
    public static string BuildQuotesBody(IEnumerable<AssetRef> assets, DisplayCurrency currency)
    {
        var payload = new
        {
            assets = assets
                .Select(asset => new
                {
                    ticker = asset.Ticker.ToUpperInvariant(),
                    assetType = asset.AssetType.ToDbValue(),
                    cryptoId = asset.CryptoId
                })
                .ToArray(),
            currency = currency.ToCode()
        };

        return JsonSerializer.Serialize(payload);
    }

    /// <summary>Série histórica de `GET /api/app/history`.</summary>
    public static PriceHistory ParseHistory(string json, AssetRef asset)
    {
        var payload = Deserialize<HistoryPayload>(json);
        var points = new List<HistoryPoint>();

        foreach (var item in payload.Points ?? [])
        {
            if (item.Timestamp is not > 0 || item.Price is not { } price)
            {
                continue;
            }

            points.Add(new HistoryPoint(item.Timestamp.Value, price));
        }

        points.Sort((left, right) => left.Timestamp.CompareTo(right.Timestamp));

        return new PriceHistory(
            string.IsNullOrWhiteSpace(payload.Ticker) ? asset.Ticker : payload.Ticker!.ToUpperInvariant(),
            AssetTypeExtensions.FromDbValue(payload.AssetType ?? asset.AssetType.ToDbValue()),
            string.IsNullOrWhiteSpace(payload.CryptoId) ? asset.CryptoId : payload.CryptoId,
            points,
            string.IsNullOrWhiteSpace(payload.Currency) ? "BRL" : payload.Currency!.ToUpperInvariant());
    }

    /// <summary>Resultados de busca de `GET /api/app/search`.</summary>
    public static IReadOnlyList<AssetSearchResult> ParseSearch(string json)
    {
        var payload = Deserialize<SearchPayload>(json);
        var results = new List<AssetSearchResult>();

        foreach (var item in payload.Results ?? [])
        {
            var ticker = item.Ticker?.Trim().ToUpperInvariant();

            if (string.IsNullOrEmpty(ticker))
            {
                continue;
            }

            results.Add(new AssetSearchResult(
                ticker,
                AssetTypeExtensions.FromDbValue(item.AssetType),
                string.IsNullOrWhiteSpace(item.CryptoId) ? null : item.CryptoId,
                string.IsNullOrWhiteSpace(item.Name) ? ticker : item.Name!.Trim(),
                string.IsNullOrWhiteSpace(item.LogoUrl) ? null : item.LogoUrl));
        }

        return results;
    }

    /// <summary>Indicadores e juros de `GET /api/app/macro`.</summary>
    public static (IReadOnlyList<MacroQuote> Quotes, IReadOnlyList<MacroRate> Rates) ParseMacro(string json)
    {
        var payload = Deserialize<MacroPayload>(json);
        var quotes = new List<MacroQuote>();

        foreach (var item in payload.Quotes ?? [])
        {
            if (string.IsNullOrWhiteSpace(item.Id) || item.Value is not { } value)
            {
                continue;
            }

            var percent = item.ChangePercent ?? 0m;

            quotes.Add(new MacroQuote(
                item.Id,
                string.IsNullOrWhiteSpace(item.Label) ? item.Id : item.Label!,
                item.Subtitle ?? string.Empty,
                value,
                ParseUnit(item.Unit),
                percent,
                item.ChangeValue ?? value * percent / (100m + percent),
                item.DayLow,
                item.DayHigh,
                item.UsdPerOunce,
                ParseTimestamp(item.UpdatedAt) ?? DateTimeOffset.UtcNow));
        }

        var rates = new List<MacroRate>();

        foreach (var item in payload.Rates ?? [])
        {
            if (string.IsNullOrWhiteSpace(item.Id) || item.Value is not { } value)
            {
                continue;
            }

            rates.Add(new MacroRate(
                item.Id,
                string.IsNullOrWhiteSpace(item.Label) ? item.Id : item.Label!,
                value,
                ParseDate(item.ReferenceDate),
                item.Note ?? string.Empty));
        }

        return (quotes, rates);
    }

    /// <summary>Manchetes de `GET /api/app/news`.</summary>
    public static IReadOnlyList<NewsItem> ParseNews(string json, NewsScope fallbackScope)
    {
        var payload = Deserialize<NewsPayload>(json);
        var items = new List<NewsItem>();

        foreach (var item in payload.Items ?? [])
        {
            if (string.IsNullOrWhiteSpace(item.Title) || string.IsNullOrWhiteSpace(item.Url))
            {
                continue;
            }

            items.Add(new NewsItem(
                item.Title!.Trim(),
                item.Url!.Trim(),
                string.IsNullOrWhiteSpace(item.Source) ? "Mercado" : item.Source!.Trim(),
                ParseTimestamp(item.PublishedAt),
                string.IsNullOrWhiteSpace(item.Scope) ? fallbackScope : item.Scope!.FromSlug(),
                string.IsNullOrWhiteSpace(item.Summary) ? null : item.Summary!.Trim()));
        }

        return items;
    }

    /// <summary>Resumo de `POST /api/app/alerts/check`.</summary>
    public static AlertRunSummary ParseAlertCheck(string json)
    {
        var payload = Deserialize<AlertCheckPayload>(json);

        if (payload.Ok != true)
        {
            throw new MarketDataException(
                string.IsNullOrWhiteSpace(payload.Error)
                    ? "O servidor não conseguiu verificar os alertas agora."
                    : payload.Error!);
        }

        var errors = payload.Errors ?? [];

        return new AlertRunSummary(
            payload.AlertsChecked ?? 0,
            payload.ConditionsMet ?? 0,
            payload.EmailsSent ?? 0,
            payload.EmailsFailed ?? 0,
            errors.Count > 0 ? string.Join(" · ", errors) : null);
    }

    /// <summary>Dólar de `GET /api/fx`.</summary>
    public static UsdRateSnapshot? ParseFx(string json)
    {
        var payload = Deserialize<FxPayload>(json);

        if (payload.Rate is not { } rate || rate <= 0m)
        {
            return null;
        }

        return new UsdRateSnapshot(
            rate,
            payload.ChangePercent,
            ParseDate(payload.ReferenceDate),
            string.IsNullOrWhiteSpace(payload.Source) ? "api" : payload.Source!,
            ParseTimestamp(payload.FetchedAt) ?? DateTimeOffset.UtcNow);
    }

    /// <summary>Mensagem de erro de uma resposta da API (`{ "error": "..." }`).</summary>
    public static string? ReadError(string json)
    {
        try
        {
            using var document = JsonDocument.Parse(json);

            return document.RootElement.ValueKind == JsonValueKind.Object &&
                   document.RootElement.TryGetProperty("error", out var error) &&
                   error.ValueKind == JsonValueKind.String
                ? error.GetString()
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static T Deserialize<T>(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<T>(json, Options)
                ?? throw new MarketDataException("O servidor devolveu uma resposta vazia.");
        }
        catch (JsonException exception)
        {
            throw new MarketDataException("O servidor devolveu um formato inesperado.", exception);
        }
    }

    private static Quote? ToQuote(QuotePayload item)
    {
        var ticker = item.Ticker?.Trim().ToUpperInvariant();

        if (string.IsNullOrEmpty(ticker) || item.Price is not { } price)
        {
            return null;
        }

        var previousClose = item.PreviousClose;
        var changeValue = item.ChangeValue
            ?? (previousClose.HasValue ? price - previousClose.Value : 0m);

        return new Quote(
            ticker,
            AssetTypeExtensions.FromDbValue(item.AssetType),
            string.IsNullOrWhiteSpace(item.CryptoId) ? null : item.CryptoId,
            string.IsNullOrWhiteSpace(item.Name) ? ticker : item.Name!.Trim(),
            price,
            item.ChangePercent ?? 0m,
            changeValue,
            previousClose,
            string.IsNullOrWhiteSpace(item.Currency) ? "BRL" : item.Currency!.ToUpperInvariant(),
            string.IsNullOrWhiteSpace(item.LogoUrl) ? null : item.LogoUrl,
            ParseTimestamp(item.UpdatedAt) ?? DateTimeOffset.UtcNow);
    }

    private static MacroUnit ParseUnit(string? unit) => unit?.Trim().ToLowerInvariant() switch
    {
        "gold-gram" => MacroUnit.GoldGram,
        "index" => MacroUnit.Index,
        _ => MacroUnit.Currency
    };

    private static DateTimeOffset? ParseTimestamp(string? value) =>
        DateTimeOffset.TryParse(
            value,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal,
            out var parsed)
            ? parsed
            : null;

    private static DateOnly? ParseDate(string? value) =>
        DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed)
            ? parsed
            : null;
}
