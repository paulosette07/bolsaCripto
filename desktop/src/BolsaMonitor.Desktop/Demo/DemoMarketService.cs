using BolsaMonitor.Core.Market;
using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Desktop.Demo;

/// <summary>
/// Cotações fictícias e determinísticas para o modo demonstração.
///
/// Serve para abrir o app e inspecionar as telas sem projeto Supabase nem chave
/// de API. Os preços são fixos e o histórico é gerado com semente estável, então
/// duas execuções mostram exatamente o mesmo gráfico.
/// </summary>
public sealed class DemoMarketService : IMarketService
{
    /// <summary>Taxa fixa usada só no modo demo para mostrar preços em dólar.</summary>
    private const decimal DemoUsdRate = 5.4m;

    private sealed record DemoAsset(
        string Ticker,
        AssetType AssetType,
        string? CryptoId,
        string Name,
        decimal Price,
        decimal ChangePercent);

    private static readonly DemoAsset[] Catalog =
    {
        new("PETR4", AssetType.Stock, null, "Petrobras PN", 38.42m, 1.24m),
        new("VALE3", AssetType.Stock, null, "Vale ON", 61.85m, -0.72m),
        new("ITUB4", AssetType.Stock, null, "Itaú Unibanco PN", 32.10m, 0.45m),
        new("BBDC4", AssetType.Stock, null, "Bradesco PN", 14.27m, -1.18m),
        new("HGLG11", AssetType.Stock, null, "CSHG Logística FII", 162.30m, -0.18m),
        new("MXRF11", AssetType.Stock, null, "Maxi Renda FII", 10.41m, 0.29m),
        new("BTC", AssetType.Crypto, "bitcoin", "Bitcoin", 612480m, 2.35m),
        new("ETH", AssetType.Crypto, "ethereum", "Ethereum", 18940.50m, -1.10m),
        new("SOL", AssetType.Crypto, "solana", "Solana", 1042.80m, 4.06m)
    };

    public Task<AssetRef> ResolveAssetAsync(AssetRef asset, CancellationToken cancellationToken = default)
    {
        if (asset.AssetType != AssetType.Crypto || !string.IsNullOrWhiteSpace(asset.CryptoId))
        {
            return Task.FromResult(asset);
        }

        var found = Find(asset.Ticker, asset.AssetType);

        return Task.FromResult(found is null ? asset : asset with { CryptoId = found.CryptoId });
    }

    public Task<IReadOnlyList<Quote>> GetQuotesAsync(IEnumerable<AssetRef> assets, CancellationToken cancellationToken = default)
    {
        var quotes = new List<Quote>();

        foreach (var asset in assets)
        {
            var found = Find(asset.Ticker, asset.AssetType);

            if (found is not null)
            {
                quotes.Add(ToQuote(found));
            }
        }

        return Task.FromResult<IReadOnlyList<Quote>>(quotes);
    }

    public async Task<IReadOnlyDictionary<string, Quote>> GetQuoteMapAsync(IEnumerable<AssetRef> assets, CancellationToken cancellationToken = default)
    {
        var quotes = await GetQuotesAsync(assets, cancellationToken).ConfigureAwait(false);

        return quotes.ToDictionary(quote => quote.Key, quote => quote, StringComparer.OrdinalIgnoreCase);
    }

    public async Task<Quote?> GetSingleQuoteAsync(AssetRef asset, CancellationToken cancellationToken = default)
    {
        var quotes = await GetQuotesAsync(new[] { asset }, cancellationToken).ConfigureAwait(false);

        return quotes.FirstOrDefault();
    }

    /// <summary>
    /// Versão com moeda: o modo demo converte cripto por uma taxa fixa, só para a
    /// tela mostrar "US$" e o usuário inspecionar o estado. Dólar de verdade vem
    /// da CoinGecko em produção.
    /// </summary>
    public async Task<Quote?> GetSingleQuoteAsync(
        AssetRef asset,
        DisplayCurrency currency,
        CancellationToken cancellationToken = default)
    {
        var quote = await GetSingleQuoteAsync(asset, cancellationToken).ConfigureAwait(false);

        if (quote is null || asset.AssetType != AssetType.Crypto || currency == DisplayCurrency.Brl)
        {
            return quote;
        }

        return quote with
        {
            Price = Math.Round(quote.Price / DemoUsdRate, 2),
            ChangeValue = Math.Round(quote.ChangeValue / DemoUsdRate, 2),
            Currency = DisplayCurrency.Usd.ToCode()
        };
    }

    public Task<PriceHistory> GetHistoryAsync(AssetRef asset, MarketRange range, CancellationToken cancellationToken = default)
    {
        var found = Find(asset.Ticker, asset.AssetType);

        if (found is null)
        {
            return Task.FromResult(PriceHistory.Empty(asset));
        }

        return Task.FromResult(new PriceHistory(
            found.Ticker,
            found.AssetType,
            found.CryptoId,
            BuildPoints(found, range)));
    }

    /// <summary>Histórico na moeda pedida: cripto é convertida pela taxa fixa do demo.</summary>
    public Task<PriceHistory> GetHistoryAsync(
        AssetRef asset,
        MarketRange range,
        DisplayCurrency currency,
        CancellationToken cancellationToken = default)
    {
        var found = Find(asset.Ticker, asset.AssetType);

        if (found is null)
        {
            return Task.FromResult(PriceHistory.Empty(asset));
        }

        var points = BuildPoints(found, range);
        var useUsd = found.AssetType == AssetType.Crypto && currency == DisplayCurrency.Usd;

        if (useUsd)
        {
            points = points
                .Select(point => new HistoryPoint(point.Timestamp, Math.Round(point.Price / DemoUsdRate, 2)))
                .ToList();
        }

        return Task.FromResult(new PriceHistory(
            found.Ticker,
            found.AssetType,
            found.CryptoId,
            points,
            useUsd ? DisplayCurrency.Usd.ToCode() : DisplayCurrency.Brl.ToCode()));
    }

    public Task<IReadOnlyList<AssetSearchResult>> SearchAsync(string query, CancellationToken cancellationToken = default)
    {
        var term = query.Trim();

        if (term.Length < 2)
        {
            return Task.FromResult<IReadOnlyList<AssetSearchResult>>(Array.Empty<AssetSearchResult>());
        }

        var results = Catalog
            .Where(asset =>
                asset.Ticker.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                asset.Name.Contains(term, StringComparison.OrdinalIgnoreCase))
            .Select(asset => new AssetSearchResult(asset.Ticker, asset.AssetType, asset.CryptoId, asset.Name, null))
            .ToList();

        return Task.FromResult<IReadOnlyList<AssetSearchResult>>(results);
    }

    private static DemoAsset? Find(string ticker, AssetType assetType) =>
        Catalog.FirstOrDefault(asset =>
            asset.AssetType == assetType &&
            string.Equals(asset.Ticker, ticker.Trim(), StringComparison.OrdinalIgnoreCase));

    private static Quote ToQuote(DemoAsset asset)
    {
        var previous = Math.Round(asset.Price / (1m + (asset.ChangePercent / 100m)), 2);

        return new Quote(
            asset.Ticker,
            asset.AssetType,
            asset.CryptoId,
            asset.Name,
            asset.Price,
            asset.ChangePercent,
            Math.Round(asset.Price - previous, 2),
            previous,
            "BRL",
            null,
            DateTimeOffset.UtcNow.AddMinutes(-2));
    }

    /// <summary>
    /// Caminhada aleatória com semente estável, reescalada para terminar no preço
    /// atual — o gráfico fica coerente com a cotação exibida no cabeçalho.
    /// </summary>
    private static IReadOnlyList<HistoryPoint> BuildPoints(DemoAsset asset, MarketRange range)
    {
        var (count, stepMinutes) = range switch
        {
            MarketRange.OneDay => (48, 15),
            MarketRange.FiveDays => (40, 180),
            MarketRange.OneMonth => (22, 1440),
            MarketRange.ThreeMonths => (66, 1440),
            MarketRange.SixMonths => (130, 1440),
            MarketRange.OneYear => (250, 1440),
            _ => (400, 1440)
        };

        var random = new Random(StableSeed(asset.Ticker, range));
        var raw = new List<decimal>(count);
        var value = 100m;

        for (var index = 0; index < count; index++)
        {
            value *= 1m + ((decimal)(random.NextDouble() - 0.48) * 0.022m);
            raw.Add(value);
        }

        var factor = asset.Price / raw[^1];
        var end = DateTimeOffset.UtcNow;
        var points = new List<HistoryPoint>(count);

        for (var index = 0; index < count; index++)
        {
            var timestamp = end
                .AddMinutes(-(double)stepMinutes * (count - 1 - index))
                .ToUnixTimeMilliseconds();

            points.Add(new HistoryPoint(timestamp, Math.Round(raw[index] * factor, 2)));
        }

        return points;
    }

    /// <summary>`string.GetHashCode` não é estável entre processos; este é.</summary>
    private static int StableSeed(string ticker, MarketRange range)
    {
        var seed = 17;

        foreach (var character in ticker)
        {
            seed = (seed * 31) + character;
        }

        return (seed * 31) + (int)range;
    }
}
