using System.Text.Json.Serialization;

using BolsaMonitor.Core.Models;
using BolsaMonitor.Core.Options;

namespace BolsaMonitor.Core.Market;

/// <summary>
/// Criptomoedas em BRL via CoinGecko.
///
/// O ticker (BTC) não é a chave da API — o id canônico é `bitcoin`. Um mapa
/// local cobre as moedas comuns (uma chamada a menos) e o endpoint /search
/// resolve o resto.
/// </summary>
public sealed class CoinGeckoClient
{
    private const string BaseUrl = "https://api.coingecko.com/api/v3";
    private const int MaxHistoryPoints = 400;

    private static readonly IReadOnlyDictionary<string, string> PopularCoins =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["BTC"] = "bitcoin",
            ["ETH"] = "ethereum",
            ["SOL"] = "solana",
            ["XRP"] = "ripple",
            ["ADA"] = "cardano",
            ["DOGE"] = "dogecoin",
            ["BNB"] = "binancecoin",
            ["LTC"] = "litecoin",
            ["BCH"] = "bitcoin-cash",
            ["DOT"] = "polkadot",
            ["MATIC"] = "matic-network",
            ["POL"] = "polygon-ecosystem-token",
            ["AVAX"] = "avalanche-2",
            ["LINK"] = "chainlink",
            ["UNI"] = "uniswap",
            ["ATOM"] = "cosmos",
            ["XLM"] = "stellar",
            ["ALGO"] = "algorand",
            ["VET"] = "vechain",
            ["NEAR"] = "near",
            ["APT"] = "aptos",
            ["ARB"] = "arbitrum",
            ["OP"] = "optimism",
            ["SUI"] = "sui",
            ["TON"] = "the-open-network",
            ["SHIB"] = "shiba-inu",
            ["TRX"] = "tron",
            ["EOS"] = "eos",
            ["ETC"] = "ethereum-classic",
            ["FIL"] = "filecoin",
            ["ICP"] = "internet-computer",
            ["HBAR"] = "hedera-hashgraph",
            ["INJ"] = "injective-protocol",
            ["RENDER"] = "render-token",
            ["IMX"] = "immutable-x",
            ["GRT"] = "the-graph",
            ["AAVE"] = "aave",
            ["MKR"] = "maker",
            ["CRV"] = "curve-dao-token",
            ["SAND"] = "the-sandbox",
            ["MANA"] = "decentraland",
            ["AXS"] = "axie-infinity",
            ["CHZ"] = "chiliz",
            ["GALA"] = "gala",
            ["PEPE"] = "pepe",
            ["WIF"] = "dogwifcoin",
            ["BONK"] = "bonk",
            ["USDT"] = "tether",
            ["USDC"] = "usd-coin",
            ["DAI"] = "dai"
        };

    private static readonly IReadOnlyDictionary<MarketRange, string> RangeDays =
        new Dictionary<MarketRange, string>
        {
            [MarketRange.OneDay] = "1",
            [MarketRange.FiveDays] = "7",
            [MarketRange.OneMonth] = "30",
            [MarketRange.ThreeMonths] = "90",
            [MarketRange.SixMonths] = "180",
            [MarketRange.OneYear] = "365",
            [MarketRange.Max] = "max"
        };

    private readonly JsonHttpClient _httpClient;
    private readonly AppOptions _options;

    public CoinGeckoClient(JsonHttpClient httpClient, AppOptions options)
    {
        _httpClient = httpClient;
        _options = options;
    }

    /// <summary>Resolve o id canônico (bitcoin) a partir do ticker (BTC).</summary>
    public async Task<string?> ResolveCoinIdAsync(string ticker, CancellationToken cancellationToken = default)
    {
        var symbol = ticker.Trim().ToUpperInvariant();

        if (symbol.Length == 0)
        {
            return null;
        }

        if (PopularCoins.TryGetValue(symbol, out var known))
        {
            return known;
        }

        var results = await SearchAsync(symbol, cancellationToken).ConfigureAwait(false);
        var exact = results.FirstOrDefault(result => string.Equals(result.Ticker, symbol, StringComparison.OrdinalIgnoreCase));

        return exact?.CryptoId ?? results.FirstOrDefault()?.CryptoId;
    }

    public async Task<IReadOnlyList<Quote>> GetQuotesAsync(
        IEnumerable<string> coinIds,
        DisplayCurrency currency = DisplayCurrency.Brl,
        CancellationToken cancellationToken = default)
    {
        currency = DisplayCurrencyExtensions.ForAsset(AssetType.Crypto, currency);
        var ids = coinIds
            .Select(id => id.Trim().ToLowerInvariant())
            .Where(id => id.Length > 0)
            .Distinct()
            .ToList();

        if (ids.Count == 0)
        {
            return Array.Empty<Quote>();
        }

        var url = $"{BaseUrl}/coins/markets?vs_currency={currency.ToApiValue()}&ids={Uri.EscapeDataString(string.Join(',', ids))}&price_change_percentage=24h&sparkline=false";
        var payload = await _httpClient.GetAsync<List<CoinMarket>>(url, Headers(), cancellationToken).ConfigureAwait(false);

        var quotes = new List<Quote>();

        foreach (var item in payload)
        {
            if (string.IsNullOrWhiteSpace(item.Id) || item.CurrentPrice is null)
            {
                continue;
            }

            var updatedAt = DateTimeOffset.TryParse(item.LastUpdated, out var parsed) ? parsed : DateTimeOffset.UtcNow;

            quotes.Add(new Quote(
                (item.Symbol ?? item.Id).ToUpperInvariant(),
                AssetType.Crypto,
                item.Id,
                string.IsNullOrWhiteSpace(item.Name) ? item.Id : item.Name!,
                item.CurrentPrice.Value,
                item.PriceChangePercentage24h ?? 0m,
                item.PriceChange24h ?? 0m,
                null,
                currency.ToCode(),
                item.Image,
                updatedAt));
        }

        return quotes;
    }

    public async Task<PriceHistory> GetHistoryAsync(
        AssetRef asset,
        MarketRange range,
        DisplayCurrency currency = DisplayCurrency.Brl,
        CancellationToken cancellationToken = default)
    {
        currency = DisplayCurrencyExtensions.ForAsset(AssetType.Crypto, currency);
        var coinId = asset.CryptoId;

        if (string.IsNullOrWhiteSpace(coinId))
        {
            coinId = await ResolveCoinIdAsync(asset.Ticker, cancellationToken).ConfigureAwait(false);
        }

        if (string.IsNullOrWhiteSpace(coinId))
        {
            throw new MarketDataException($"Não foi possível identificar a criptomoeda \"{asset.Ticker}\".");
        }

        var days = RangeDays[range];
        List<HistoryPoint> points;

        try
        {
            points = await FetchChartAsync(coinId, days, currency, cancellationToken).ConfigureAwait(false);
        }
        catch (MarketDataException) when (days == "max")
        {
            // Plano público limita a janela histórica.
            points = await FetchChartAsync(coinId, "365", currency, cancellationToken).ConfigureAwait(false);
        }

        return new PriceHistory(
            asset.Ticker.ToUpperInvariant(),
            AssetType.Crypto,
            coinId,
            Downsample(points, MaxHistoryPoints),
            currency.ToCode());
    }

    public async Task<IReadOnlyList<AssetSearchResult>> SearchAsync(string query, CancellationToken cancellationToken = default)
    {
        var trimmed = query.Trim();

        if (trimmed.Length == 0)
        {
            return Array.Empty<AssetSearchResult>();
        }

        var url = $"{BaseUrl}/search?query={Uri.EscapeDataString(trimmed)}";
        var payload = await _httpClient.GetAsync<SearchResponse>(url, Headers(), cancellationToken).ConfigureAwait(false);

        return (payload.Coins ?? new List<SearchCoin>())
            .Where(coin => !string.IsNullOrWhiteSpace(coin.Id) && !string.IsNullOrWhiteSpace(coin.Symbol))
            .Take(8)
            .Select(coin => new AssetSearchResult(
                coin.Symbol!.ToUpperInvariant(),
                AssetType.Crypto,
                coin.Id,
                string.IsNullOrWhiteSpace(coin.Name) ? coin.Id! : coin.Name!,
                coin.Large ?? coin.Thumb))
            .ToList();
    }

    /// <summary>O id canônico de uma moeda a partir do ticker (para a carteira).</summary>
    public bool TryGetKnownCoinId(string ticker, out string coinId)
    {
        if (PopularCoins.TryGetValue(ticker.Trim(), out var known))
        {
            coinId = known;
            return true;
        }

        coinId = string.Empty;
        return false;
    }

    private async Task<List<HistoryPoint>> FetchChartAsync(
        string coinId,
        string days,
        DisplayCurrency currency,
        CancellationToken cancellationToken)
    {
        var url = $"{BaseUrl}/coins/{Uri.EscapeDataString(coinId)}/market_chart?vs_currency={currency.ToApiValue()}&days={days}";
        var payload = await _httpClient.GetAsync<MarketChartResponse>(url, Headers(), cancellationToken).ConfigureAwait(false);

        var points = new List<HistoryPoint>();

        foreach (var entry in payload.Prices ?? new List<List<decimal>>())
        {
            if (entry.Count >= 2)
            {
                points.Add(new HistoryPoint((long)entry[0], entry[1]));
            }
        }

        points.Sort((left, right) => left.Timestamp.CompareTo(right.Timestamp));

        return points;
    }

    private static IReadOnlyList<HistoryPoint> Downsample(List<HistoryPoint> points, int limit)
    {
        if (points.Count <= limit)
        {
            return points;
        }

        var step = (double)points.Count / limit;
        var sampled = new List<HistoryPoint>(limit + 1);

        for (var index = 0; index < limit; index++)
        {
            var candidate = points[(int)Math.Floor(index * step)];

            if (!sampled.Contains(candidate))
            {
                sampled.Add(candidate);
            }
        }

        var last = points[^1];

        if (sampled.Count == 0 || sampled[^1] != last)
        {
            sampled.Add(last);
        }

        return sampled;
    }

    private IReadOnlyDictionary<string, string>? Headers() =>
        string.IsNullOrWhiteSpace(_options.CoinGeckoApiKey)
            ? null
            : new Dictionary<string, string> { ["x-cg-demo-api-key"] = _options.CoinGeckoApiKey };

    private sealed record CoinMarket(
        string? Id,
        string? Symbol,
        string? Name,
        string? Image,
        decimal? CurrentPrice,
        decimal? PriceChange24h,
        decimal? PriceChangePercentage24h,
        string? LastUpdated);

    private sealed record MarketChartResponse(List<List<decimal>>? Prices);

    private sealed record SearchResponse(List<SearchCoin>? Coins);

    private sealed record SearchCoin(
        string? Id,
        string? Name,
        string? Symbol,
        string? Large,
        string? Thumb,
        [property: JsonPropertyName("market_cap_rank")] int? MarketCapRank);
}
