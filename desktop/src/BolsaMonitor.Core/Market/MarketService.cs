using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Core.Market;

/// <summary>
/// Ponto único de acesso a cotações no desktop — as ViewModels nunca falam com
/// Brapi/CoinGecko diretamente. É o espelho de `web/lib/market/index.ts`.
/// </summary>
public sealed class MarketService : IMarketService
{
    private readonly BrapiClient _brapi;
    private readonly CoinGeckoClient _coinGecko;

    public MarketService(BrapiClient brapi, CoinGeckoClient coinGecko)
    {
        _brapi = brapi;
        _coinGecko = coinGecko;
    }

    /// <summary>
    /// Garante que um ativo cripto tenha o id canônico preenchido.
    /// Retorna o mesmo objeto para ativos de bolsa.
    /// </summary>
    public async Task<AssetRef> ResolveAssetAsync(AssetRef asset, CancellationToken cancellationToken = default)
    {
        if (asset.AssetType != AssetType.Crypto || !string.IsNullOrWhiteSpace(asset.CryptoId))
        {
            return asset;
        }

        var coinId = await _coinGecko.ResolveCoinIdAsync(asset.Ticker, cancellationToken).ConfigureAwait(false);

        return asset with { CryptoId = coinId };
    }

    /// <summary>Cotações de uma lista mista: no máximo 2 chamadas HTTP.</summary>
    public Task<IReadOnlyList<Quote>> GetQuotesAsync(
        IEnumerable<AssetRef> assets,
        CancellationToken cancellationToken = default) =>
        GetQuotesAsync(assets, DisplayCurrency.Brl, cancellationToken);

    /// <summary>
    /// Cotações na moeda pedida. O parâmetro só afeta cripto: ações e FIIs da B3
    /// são cotados em reais e continuam sendo devolvidos em reais.
    /// </summary>
    public async Task<IReadOnlyList<Quote>> GetQuotesAsync(
        IEnumerable<AssetRef> assets,
        DisplayCurrency currency,
        CancellationToken cancellationToken = default)
    {
        var stockTickers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var cryptoIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var pendingCrypto = new List<string>();

        foreach (var asset in assets)
        {
            if (asset.AssetType == AssetType.Stock)
            {
                stockTickers.Add(asset.Ticker.Trim().ToUpperInvariant());
            }
            else if (!string.IsNullOrWhiteSpace(asset.CryptoId))
            {
                cryptoIds.Add(asset.CryptoId!);
            }
            else
            {
                pendingCrypto.Add(asset.Ticker);
            }
        }

        foreach (var ticker in pendingCrypto)
        {
            var coinId = await _coinGecko.ResolveCoinIdAsync(ticker, cancellationToken).ConfigureAwait(false);

            if (!string.IsNullOrWhiteSpace(coinId))
            {
                cryptoIds.Add(coinId);
            }
        }

        var stockTask = stockTickers.Count > 0
            ? _brapi.GetQuotesAsync(stockTickers, cancellationToken)
            : Task.FromResult<IReadOnlyList<Quote>>(Array.Empty<Quote>());

        var cryptoTask = cryptoIds.Count > 0
            ? _coinGecko.GetQuotesAsync(cryptoIds, currency, cancellationToken)
            : Task.FromResult<IReadOnlyList<Quote>>(Array.Empty<Quote>());

        await Task.WhenAll(stockTask, cryptoTask).ConfigureAwait(false);

        return stockTask.Result.Concat(cryptoTask.Result).ToList();
    }

    /// <summary>Mapa `Tipo:TICKER` -> cotação.</summary>
    public async Task<IReadOnlyDictionary<string, Quote>> GetQuoteMapAsync(IEnumerable<AssetRef> assets, CancellationToken cancellationToken = default)
    {
        var quotes = await GetQuotesAsync(assets, cancellationToken).ConfigureAwait(false);

        return quotes.ToDictionary(quote => quote.Key, quote => quote, StringComparer.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Mapa na moeda pedida. Serve à faixa de favoritos: os cards de cripto
    /// acompanham o seletor da tela, sem perder a cotação da B3 em reais.
    /// </summary>
    public async Task<IReadOnlyDictionary<string, Quote>> GetQuoteMapAsync(
        IEnumerable<AssetRef> assets,
        DisplayCurrency currency,
        CancellationToken cancellationToken = default)
    {
        var quotes = await GetQuotesAsync(assets, currency, cancellationToken).ConfigureAwait(false);

        return quotes.ToDictionary(quote => quote.Key, quote => quote, StringComparer.OrdinalIgnoreCase);
    }

    public Task<Quote?> GetSingleQuoteAsync(AssetRef asset, CancellationToken cancellationToken = default) =>
        GetQuotesAsync(new[] { asset }, cancellationToken)
            .ContinueWith(task => task.Result.FirstOrDefault() as Quote, TaskContinuationOptions.OnlyOnRanToCompletion);

    public Task<Quote?> GetSingleQuoteAsync(
        AssetRef asset,
        DisplayCurrency currency,
        CancellationToken cancellationToken = default) =>
        GetQuotesAsync(new[] { asset }, currency, cancellationToken)
            .ContinueWith(task => task.Result.FirstOrDefault() as Quote, TaskContinuationOptions.OnlyOnRanToCompletion);

    public Task<PriceHistory> GetHistoryAsync(AssetRef asset, MarketRange range, CancellationToken cancellationToken = default) =>
        asset.AssetType == AssetType.Stock
            ? _brapi.GetHistoryAsync(asset, range, cancellationToken)
            : _coinGecko.GetHistoryAsync(asset, range, DisplayCurrency.Brl, cancellationToken);

    public Task<PriceHistory> GetHistoryAsync(
        AssetRef asset,
        MarketRange range,
        DisplayCurrency currency,
        CancellationToken cancellationToken = default) =>
        asset.AssetType == AssetType.Stock
            ? _brapi.GetHistoryAsync(asset, range, cancellationToken)
            : _coinGecko.GetHistoryAsync(asset, range, currency, cancellationToken);

    /// <summary>Busca unificada: ações primeiro (público é B3), cripto depois.</summary>
    public async Task<IReadOnlyList<AssetSearchResult>> SearchAsync(string query, CancellationToken cancellationToken = default)
    {
        var trimmed = query.Trim();

        if (trimmed.Length < 2)
        {
            return Array.Empty<AssetSearchResult>();
        }

        var stocksTask = SearchStocksAsync(trimmed, cancellationToken);
        var cryptoTask = SafeCryptoSearchAsync(trimmed, cancellationToken);

        await Task.WhenAll(stocksTask, cryptoTask).ConfigureAwait(false);

        return stocksTask.Result.Concat(cryptoTask.Result).Take(14).ToList();
    }

    private async Task<IReadOnlyList<AssetSearchResult>> SearchStocksAsync(string query, CancellationToken cancellationToken)
    {
        try
        {
            var url = $"https://brapi.dev/api/quote/list?search={Uri.EscapeDataString(query)}&limit=10";
            var httpClient = new JsonHttpClient(new HttpClient());
            var payload = await httpClient.GetAsync<BrapiStockListResponse>(url, cancellationToken: cancellationToken)
                .ConfigureAwait(false);

            if (payload.Error == true)
            {
                return Array.Empty<AssetSearchResult>();
            }

            return (payload.Stocks ?? new List<BrapiStockListItem>())
                .Where(item => !string.IsNullOrWhiteSpace(item.Stock))
                .Select(item => new AssetSearchResult(
                    item.Stock!.ToUpperInvariant(),
                    AssetType.Stock,
                    null,
                    string.IsNullOrWhiteSpace(item.Name) ? item.Stock!.ToUpperInvariant() : item.Name!,
                    item.Logo))
                .ToList();
        }
        catch (MarketDataException)
        {
            // Busca é conveniência: o usuário pode digitar o ticker direto.
            return Array.Empty<AssetSearchResult>();
        }
    }

    private async Task<IReadOnlyList<AssetSearchResult>> SafeCryptoSearchAsync(string query, CancellationToken cancellationToken)
    {
        try
        {
            return await _coinGecko.SearchAsync(query, cancellationToken).ConfigureAwait(false);
        }
        catch (MarketDataException)
        {
            return Array.Empty<AssetSearchResult>();
        }
    }

    private sealed record BrapiStockListResponse(List<BrapiStockListItem>? Stocks, bool? Error);

    private sealed record BrapiStockListItem(string? Stock, string? Name, string? Logo);
}
