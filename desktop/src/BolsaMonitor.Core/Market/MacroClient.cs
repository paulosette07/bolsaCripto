using System.Globalization;
using System.Text.Json;

using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Core.Market;

/// <summary>
/// Indicadores macro do painel, espelhando `web/lib/market/macro.ts` e
/// `web/lib/market/rates.ts`.
///
/// Fontes, cada uma pelo que faz melhor:
///  - **AwesomeAPI** devolve dólar, euro e ouro já em reais, com máxima/mínima
///    do dia (sem chave);
///  - **Yahoo** cobre o Ibovespa, que a AwesomeAPI não tem, e serve de reserva
///    do câmbio quando a primeira falha;
///  - **Banco Central (SGS)** fornece Selic meta e IPCA em 12 meses.
///
/// Falha de um bloco não derruba o painel: devolvemos o que respondeu.
/// </summary>
public sealed class MacroClient : IMacroService
{
    private const string AwesomeUrl = "https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL,XAU-BRL";
    private const string BcbBaseUrl = "https://api.bcb.gov.br/dados/serie/bcdata.sgs";

    private const string IbovespaSymbol = "^BVSP";
    private const string GoldFuturesSymbol = "GC=F";
    private const string UsdSymbol = "USDBRL=X";
    private const string EurSymbol = "EURBRL=X";

    /// <summary>Onça-troy: 31,1034768 g — padrão para ouro, prata e platina.</summary>
    private const decimal GramsPerTroyOunce = 31.1034768m;

    private readonly HttpClient _httpClient;
    private readonly YahooClient _yahooClient;

    public MacroClient(HttpClient httpClient, YahooClient yahooClient)
    {
        _httpClient = httpClient;
        _httpClient.Timeout = TimeSpan.FromSeconds(20);
        _yahooClient = yahooClient;
    }

    private sealed record MacroConfig(string Id, string Label, string Subtitle, MacroUnit Unit, decimal Scale);

    private static readonly MacroConfig UsdConfig = new("usd-brl", "Dólar", "USD → BRL · comercial", MacroUnit.Currency, 1m);
    private static readonly MacroConfig EurConfig = new("eur-brl", "Euro", "EUR → BRL", MacroUnit.Currency, 1m);
    private static readonly MacroConfig GoldConfig = new("gold", "Ouro", "grama · onça-troy", MacroUnit.GoldGram, GramsPerTroyOunce);
    private static readonly MacroConfig IbovConfig = new("ibov", "Ibovespa", "B3 · índice à vista", MacroUnit.Index, 1m);

    public async Task<IReadOnlyList<MacroQuote>> GetQuotesAsync(CancellationToken cancellationToken = default)
    {
        var ibovTask = GetIbovespaAsync(cancellationToken);

        IReadOnlyList<MacroQuote> quotes;

        try
        {
            quotes = await GetAwesomeQuotesAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (Exception exception) when (exception is MarketDataException or HttpRequestException or JsonException or TaskCanceledException)
        {
            quotes = await GetYahooFallbackAsync(cancellationToken).ConfigureAwait(false);
        }

        var ibov = await ibovTask.ConfigureAwait(false);
        var byId = quotes.ToDictionary(quote => quote.Id, StringComparer.OrdinalIgnoreCase);

        if (ibov is not null)
        {
            byId[ibov.Id] = ibov;
        }

        return new[] { UsdConfig, EurConfig, GoldConfig, IbovConfig }
            .Select(config => byId.TryGetValue(config.Id, out var quote) ? quote : null)
            .Where(quote => quote is not null)
            .Select(quote => quote!)
            .ToList();
    }

    public async Task<IReadOnlyList<MacroRate>> GetRatesAsync(CancellationToken cancellationToken = default)
    {
        var series = new (string Id, string Label, int Code, string Note)[]
        {
            ("selic", "Selic", 432, "meta definida pelo Copom"),
            ("ipca", "IPCA", 13522, "acumulado em 12 meses")
        };

        var tasks = series.Select(entry => GetRateAsync(entry.Id, entry.Label, entry.Code, entry.Note, cancellationToken));
        var results = await Task.WhenAll(tasks).ConfigureAwait(false);

        return results.Where(rate => rate is not null).Select(rate => rate!).ToList();
    }

    private async Task<IReadOnlyList<MacroQuote>> GetAwesomeQuotesAsync(CancellationToken cancellationToken)
    {
        using var document = await GetJsonAsync(AwesomeUrl, cancellationToken).ConfigureAwait(false);
        var root = document.RootElement;

        var usd = ReadAwesomePair(root, "USDBRL", UsdConfig);
        var eur = ReadAwesomePair(root, "EURBRL", EurConfig);
        var gold = ReadAwesomePair(root, "XAUBRL", GoldConfig);

        var quotes = new List<MacroQuote>();

        if (usd is not null)
        {
            quotes.Add(usd);
        }

        if (eur is not null)
        {
            quotes.Add(eur);
        }

        if (gold is not null)
        {
            // A série XAU-BRL é por onça: dividindo a onça em reais pelo dólar do
            // mesmo instante sai o preço da onça em dólar, sem segunda chamada.
            var usdRate = usd?.Value;
            var ounceBrl = gold.Value * GramsPerTroyOunce;

            quotes.Add(gold with
            {
                UsdPerOunce = usdRate is > 0m ? ounceBrl / usdRate.Value : null
            });
        }

        return quotes;
    }

    private static MacroQuote? ReadAwesomePair(JsonElement root, string key, MacroConfig config)
    {
        if (!root.TryGetProperty(key, out var pair) ||
            !TryReadStringDecimal(pair, "bid", out var bid) ||
            bid <= 0m)
        {
            return null;
        }

        var value = bid / config.Scale;
        var percent = TryReadStringDecimal(pair, "pctChange", out var parsedPercent) ? parsedPercent : 0m;
        var absolute = TryReadStringDecimal(pair, "varBid", out var parsedAbsolute) ? parsedAbsolute : (decimal?)null;

        var updatedAt = TryReadStringDecimal(pair, "timestamp", out var seconds) && seconds > 0m
            ? DateTimeOffset.FromUnixTimeSeconds((long)seconds)
            : DateTimeOffset.UtcNow;

        return new MacroQuote(
            config.Id,
            config.Label,
            config.Subtitle,
            value,
            config.Unit,
            percent,
            absolute is null ? value * percent / (100m + percent) : absolute.Value / config.Scale,
            TryReadStringDecimal(pair, "low", out var low) && low > 0m ? low / config.Scale : null,
            TryReadStringDecimal(pair, "high", out var high) && high > 0m ? high / config.Scale : null,
            null,
            updatedAt);
    }

    /// <summary>Reserva do câmbio: Yahoo para dólar/euro e ouro futuro convertido pelo dólar.</summary>
    private async Task<IReadOnlyList<MacroQuote>> GetYahooFallbackAsync(CancellationToken cancellationToken)
    {
        var quotes = new List<MacroQuote>();

        MarketSnapshot? usd = null;

        try
        {
            usd = await _yahooClient.GetSnapshotAsync(UsdSymbol, cancellationToken).ConfigureAwait(false);
            quotes.Add(FromSnapshot(usd, UsdConfig));
        }
        catch (MarketDataException)
        {
            // Sem dólar não há como converter o ouro; seguimos com o que der.
        }

        try
        {
            var eur = await _yahooClient.GetSnapshotAsync(EurSymbol, cancellationToken).ConfigureAwait(false);
            quotes.Add(FromSnapshot(eur, EurConfig));
        }
        catch (MarketDataException)
        {
        }

        if (usd is not null && usd.Price > 0m)
        {
            try
            {
                var futures = await _yahooClient.GetSnapshotAsync(GoldFuturesSymbol, cancellationToken).ConfigureAwait(false);
                var ounceBrl = futures.Price * usd.Price;
                var gram = ounceBrl / GramsPerTroyOunce;

                quotes.Add(new MacroQuote(
                    GoldConfig.Id,
                    GoldConfig.Label,
                    GoldConfig.Subtitle,
                    gram,
                    MacroUnit.GoldGram,
                    futures.ChangePercent,
                    gram * futures.ChangePercent / 100m,
                    null,
                    null,
                    futures.Price,
                    futures.UpdatedAt));
            }
            catch (MarketDataException)
            {
            }
        }

        return quotes;
    }

    private async Task<MacroQuote?> GetIbovespaAsync(CancellationToken cancellationToken)
    {
        try
        {
            var snapshot = await _yahooClient.GetSnapshotAsync(IbovespaSymbol, cancellationToken).ConfigureAwait(false);

            return FromSnapshot(snapshot, IbovConfig);
        }
        catch (MarketDataException)
        {
            return null;
        }
    }

    private static MacroQuote FromSnapshot(MarketSnapshot snapshot, MacroConfig config) =>
        new(
            config.Id,
            config.Label,
            config.Subtitle,
            snapshot.Price / config.Scale,
            config.Unit,
            snapshot.ChangePercent,
            snapshot.ChangeValue / config.Scale,
            snapshot.DayLow is null ? null : snapshot.DayLow.Value / config.Scale,
            snapshot.DayHigh is null ? null : snapshot.DayHigh.Value / config.Scale,
            null,
            snapshot.UpdatedAt);

    private async Task<MacroRate?> GetRateAsync(
        string id,
        string label,
        int code,
        string note,
        CancellationToken cancellationToken)
    {
        try
        {
            using var document = await GetJsonAsync(
                $"{BcbBaseUrl}.{code}/dados/ultimos/1?formato=json",
                cancellationToken).ConfigureAwait(false);

            var root = document.RootElement;

            if (root.ValueKind != JsonValueKind.Array || root.GetArrayLength() == 0)
            {
                return null;
            }

            var latest = root[root.GetArrayLength() - 1];

            if (!TryReadStringDecimal(latest, "valor", out var value))
            {
                return null;
            }

            return new MacroRate(id, label, value, ReadBcbDate(latest), note);
        }
        catch (Exception exception) when (exception is MarketDataException or HttpRequestException or JsonException or TaskCanceledException)
        {
            return null;
        }
    }

    /// <summary>`09/12/2026` (dd/MM/yyyy do BCB) -> data tipada.</summary>
    private static DateOnly? ReadBcbDate(JsonElement element)
    {
        if (!element.TryGetProperty("data", out var property) ||
            property.ValueKind != JsonValueKind.String)
        {
            return null;
        }

        return DateTime.TryParseExact(
            property.GetString(),
            "dd/MM/yyyy",
            CultureInfo.InvariantCulture,
            DateTimeStyles.None,
            out var parsed)
            ? DateOnly.FromDateTime(parsed)
            : null;
    }

    private async Task<JsonDocument> GetJsonAsync(string url, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.TryAddWithoutValidation("accept", "application/json");

        using var response = await _httpClient
            .SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken)
            .ConfigureAwait(false);

        if (!response.IsSuccessStatusCode)
        {
            throw new MarketDataException($"A fonte de dados respondeu HTTP {(int)response.StatusCode}.");
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);

        return await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);
    }

    /// <summary>A AwesomeAPI manda número como string ("5.90"); o BCB também.</summary>
    private static bool TryReadStringDecimal(JsonElement element, string property, out decimal value)
    {
        value = 0m;

        if (!element.TryGetProperty(property, out var found))
        {
            return false;
        }

        return found.ValueKind switch
        {
            JsonValueKind.String => decimal.TryParse(
                found.GetString(),
                NumberStyles.Any,
                CultureInfo.InvariantCulture,
                out value),
            JsonValueKind.Number => found.TryGetDecimal(out value),
            _ => false
        };
    }
}
