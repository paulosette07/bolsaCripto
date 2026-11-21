using System.Globalization;

using BolsaMonitor.Core.Models;
using BolsaMonitor.Core.Options;

namespace BolsaMonitor.Core.Market;

/// <summary>
/// Cotações da B3 via Brapi (https://brapi.dev).
/// Funciona sem token; o token só amplia o rate limit.
/// </summary>
public sealed class BrapiClient
{
    private const string BaseUrl = "https://brapi.dev/api";

    private static readonly IReadOnlyDictionary<MarketRange, (string Range, string Interval)> RangeIntervals =
        new Dictionary<MarketRange, (string, string)>
        {
            [MarketRange.OneDay] = ("1d", "5m"),
            [MarketRange.FiveDays] = ("5d", "1h"),
            [MarketRange.OneMonth] = ("1mo", "1d"),
            [MarketRange.ThreeMonths] = ("3mo", "1d"),
            [MarketRange.SixMonths] = ("6mo", "1d"),
            [MarketRange.OneYear] = ("1y", "1d"),
            [MarketRange.Max] = ("max", "1mo")
        };

    private readonly JsonHttpClient _httpClient;
    private readonly AppOptions _options;

    public BrapiClient(JsonHttpClient httpClient, AppOptions options)
    {
        _httpClient = httpClient;
        _options = options;
    }

    public async Task<IReadOnlyList<Quote>> GetQuotesAsync(IEnumerable<string> tickers, CancellationToken cancellationToken = default)
    {
        var symbols = tickers
            .Select(ticker => ticker.Trim().ToUpperInvariant())
            .Where(ticker => ticker.Length > 0)
            .Distinct()
            .ToList();

        if (symbols.Count == 0)
        {
            return Array.Empty<Quote>();
        }

        var url = WithToken($"{BaseUrl}/quote/{Uri.EscapeDataString(string.Join(',', symbols))}");
        var payload = await _httpClient.GetAsync<BrapiResponse>(url, cancellationToken: cancellationToken)
            .ConfigureAwait(false);

        EnsureNoError(payload);

        var quotes = new List<Quote>();

        foreach (var result in payload.Results ?? Enumerable.Empty<BrapiQuote>())
        {
            var quote = ToQuote(result);

            if (quote is not null)
            {
                quotes.Add(quote);
            }
        }

        return quotes;
    }

    public async Task<PriceHistory> GetHistoryAsync(AssetRef asset, MarketRange range, CancellationToken cancellationToken = default)
    {
        var symbol = asset.Ticker.Trim().ToUpperInvariant();
        var mapping = RangeIntervals[range];

        async Task<IReadOnlyList<BrapiHistoryPoint>> FetchAsync(string interval)
        {
            var url = WithToken($"{BaseUrl}/quote/{Uri.EscapeDataString(symbol)}?range={mapping.Range}&interval={interval}");
            var payload = await _httpClient.GetAsync<BrapiResponse>(url, cancellationToken: cancellationToken)
                .ConfigureAwait(false);

            EnsureNoError(payload);

            return payload.Results?.FirstOrDefault()?.HistoricalDataPrice ?? Array.Empty<BrapiHistoryPoint>();
        }

        IReadOnlyList<BrapiHistoryPoint> raw;

        try
        {
            raw = await FetchAsync(mapping.Interval).ConfigureAwait(false);
        }
        catch (MarketDataException) when (mapping.Interval != "1d")
        {
            // Combinação range/interval recusada: cai para diário.
            raw = await FetchAsync("1d").ConfigureAwait(false);
        }

        var points = raw
            .Where(point => point.Date.HasValue && point.Close.HasValue)
            .Select(point => new HistoryPoint(point.Date!.Value * 1000L, point.Close!.Value))
            .OrderBy(point => point.Timestamp)
            .ToList();

        return new PriceHistory(symbol, AssetType.Stock, null, points);
    }

    private string WithToken(string url)
    {
        if (string.IsNullOrWhiteSpace(_options.BrapiToken))
        {
            return url;
        }

        var separator = url.Contains('?') ? '&' : '?';

        return $"{url}{separator}token={Uri.EscapeDataString(_options.BrapiToken)}";
    }

    private static void EnsureNoError(BrapiResponse payload)
    {
        if (payload.Error == true)
        {
            throw new MarketDataException(payload.Message ?? "A Brapi recusou a consulta.");
        }
    }

    private static Quote? ToQuote(BrapiQuote result)
    {
        var ticker = result.Symbol?.Trim().ToUpperInvariant();
        var price = result.RegularMarketPrice;

        if (string.IsNullOrEmpty(ticker) || price is null)
        {
            return null;
        }

        var previousClose = result.RegularMarketPreviousClose;
        var changeValue = result.RegularMarketChange
            ?? (previousClose.HasValue ? price.Value - previousClose.Value : 0m);

        var updatedAt = DateTimeOffset.TryParse(
            result.RegularMarketTime,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal,
            out var parsed)
            ? parsed
            : DateTimeOffset.UtcNow;

        return new Quote(
            ticker,
            AssetType.Stock,
            null,
            FirstNonEmpty(result.LongName, result.ShortName, ticker),
            price.Value,
            result.RegularMarketChangePercent ?? 0m,
            changeValue,
            previousClose,
            "BRL",
            string.IsNullOrWhiteSpace(result.Logourl) ? $"https://icons.brapi.dev/icons/{ticker}.svg" : result.Logourl,
            updatedAt);
    }

    private static string FirstNonEmpty(params string?[] values) =>
        values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)) ?? string.Empty;

    private sealed record BrapiResponse(
        IReadOnlyList<BrapiQuote>? Results,
        bool? Error,
        string? Message);

    private sealed record BrapiQuote(
        string? Symbol,
        string? ShortName,
        string? LongName,
        decimal? RegularMarketPrice,
        decimal? RegularMarketChange,
        decimal? RegularMarketChangePercent,
        decimal? RegularMarketPreviousClose,
        string? RegularMarketTime,
        string? Logourl,
        IReadOnlyList<BrapiHistoryPoint>? HistoricalDataPrice);

    private sealed record BrapiHistoryPoint(
        long? Date,
        decimal? Open,
        decimal? High,
        decimal? Low,
        decimal? Close,
        long? Volume,
        decimal? AdjustedClose);
}
