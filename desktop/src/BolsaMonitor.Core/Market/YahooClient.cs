using System.Globalization;
using System.Text.Json;

using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Core.Market;

/// <summary>
/// Símbolos do Yahoo Finance que não são ações da B3: índice, câmbio e
/// commodity. O endpoint `chart` devolve cotação, variação e faixa do dia num
/// único GET — é o mesmo usado na web (`web/lib/market/yahoo.ts`).
///
/// Este cliente é separado de <see cref="BrapiClient"/> de propósito: ali o
/// sufixo `.SA` é obrigatório, aqui ele quebraria o símbolo (`^BVSP`, `GC=F`).
/// </summary>
public sealed class YahooClient
{
    private static readonly string[] Hosts =
    {
        "https://query2.finance.yahoo.com",
        "https://query1.finance.yahoo.com"
    };

    /// <summary>Com User-Agent de browser o CDN libera; com UA genérico vem 429.</summary>
    private const string BrowserUserAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    private readonly HttpClient _httpClient;

    public YahooClient(HttpClient httpClient)
    {
        _httpClient = httpClient;
        _httpClient.Timeout = TimeSpan.FromSeconds(20);
    }

    public async Task<MarketSnapshot> GetSnapshotAsync(string symbol, CancellationToken cancellationToken = default)
    {
        var normalized = symbol.Trim().ToUpperInvariant();
        JsonDocument? document = null;
        Exception? lastError = null;

        foreach (var host in Hosts)
        {
            try
            {
                document = await GetChartAsync(host, normalized, cancellationToken).ConfigureAwait(false);

                break;
            }
            catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException)
            {
                // Host limitado por rate limit: tenta o próximo.
                lastError = exception;
            }
        }

        if (document is null)
        {
            throw new MarketDataException(
                "Não foi possível consultar o índice agora.",
                lastError);
        }

        using (document)
        {
            return ReadSnapshot(document.RootElement, normalized);
        }
    }

    private async Task<JsonDocument> GetChartAsync(string host, string symbol, CancellationToken cancellationToken)
    {
        var url = $"{host}/v8/finance/chart/{Uri.EscapeDataString(symbol)}?range=1d&interval=1d";

        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.TryAddWithoutValidation("accept", "application/json");
        request.Headers.TryAddWithoutValidation("user-agent", BrowserUserAgent);

        using var response = await _httpClient
            .SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken)
            .ConfigureAwait(false);

        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException($"Yahoo respondeu HTTP {(int)response.StatusCode}.");
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);

        return await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);
    }

    private static MarketSnapshot ReadSnapshot(JsonElement root, string symbol)
    {
        if (!root.TryGetProperty("chart", out var chart) ||
            !chart.TryGetProperty("result", out var results) ||
            results.ValueKind != JsonValueKind.Array ||
            results.GetArrayLength() == 0)
        {
            throw new MarketDataException($"Sem cotação para \"{symbol}\".");
        }

        var result = results[0];

        if (!result.TryGetProperty("meta", out var meta))
        {
            throw new MarketDataException($"Sem cotação para \"{symbol}\".");
        }

        var price = ReadDecimal(meta, "regularMarketPrice")
            ?? throw new MarketDataException($"Sem cotação para \"{symbol}\".");

        var previousClose = ReadDecimal(meta, "chartPreviousClose");
        var changePercent = ReadDecimal(meta, "regularMarketChangePercent")
            ?? (previousClose is > 0m ? (price - previousClose.Value) / previousClose.Value * 100m : 0m);

        var resolvedSymbol = ReadString(meta, "symbol") ?? symbol;
        var name = ReadString(meta, "longName")
            ?? ReadString(meta, "shortName")
            ?? resolvedSymbol;

        var updatedAt = ReadLong(meta, "regularMarketTime") is { } seconds
            ? DateTimeOffset.FromUnixTimeSeconds(seconds)
            : DateTimeOffset.UtcNow;

        return new MarketSnapshot(
            resolvedSymbol,
            name,
            price,
            changePercent,
            previousClose is null ? 0m : price - previousClose.Value,
            PositiveOrNull(ReadDecimal(meta, "regularMarketDayLow")),
            PositiveOrNull(ReadDecimal(meta, "regularMarketDayHigh")),
            ReadString(meta, "currency") ?? "BRL",
            updatedAt);
    }

    /// <summary>Fora do pregão o Yahoo devolve 0 — tratamos como "sem informação".</summary>
    private static decimal? PositiveOrNull(decimal? value) => value is > 0m ? value : null;

    private static decimal? ReadDecimal(JsonElement element, string property)
    {
        if (!element.TryGetProperty(property, out var value))
        {
            return null;
        }

        return value.ValueKind switch
        {
            JsonValueKind.Number when value.TryGetDecimal(out var parsed) => parsed,
            JsonValueKind.String when decimal.TryParse(
                value.GetString(),
                NumberStyles.Any,
                CultureInfo.InvariantCulture,
                out var parsed) => parsed,
            _ => null
        };
    }

    private static long? ReadLong(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.Number &&
        value.TryGetInt64(out var parsed)
            ? parsed
            : null;

    private static string? ReadString(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
}
