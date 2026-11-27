using BolsaMonitor.Core.Market;
using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Core.Api;

/// <summary>
/// <see cref="IMarketService"/> servido pela API do Bolsa Monitor — o modo
/// padrão da release.
///
/// Não guarda cache próprio: o servidor já cacheia Brapi/CoinGecko por alguns
/// segundos e o app pede em lote a cada refresh de tela. Duplicar cache aqui só
/// criaria a chance de mostrar preço velho depois de um "Atualizar".
///
/// Cripto sem `cryptoId` é resolvida no servidor pela busca (`/api/app/search`),
/// porque a CoinGecko precisa do id, não do ticker.
/// </summary>
public sealed class ApiMarketService : IMarketService
{
    private readonly ApiClient _api;

    public ApiMarketService(ApiClient api)
    {
        _api = api;
    }

    public async Task<AssetRef> ResolveAssetAsync(AssetRef asset, CancellationToken cancellationToken = default)
    {
        if (asset.AssetType != AssetType.Crypto || !string.IsNullOrWhiteSpace(asset.CryptoId))
        {
            return asset;
        }

        var results = await SearchAsync(asset.Ticker, cancellationToken).ConfigureAwait(false);
        var match = results.FirstOrDefault(result =>
            result.AssetType == AssetType.Crypto &&
            string.Equals(result.Ticker, asset.Ticker, StringComparison.OrdinalIgnoreCase));

        return match?.CryptoId is { Length: > 0 } cryptoId
            ? asset with { CryptoId = cryptoId }
            : asset;
    }

    public async Task<IReadOnlyList<Quote>> GetQuotesAsync(
        IEnumerable<AssetRef> assets,
        CancellationToken cancellationToken = default)
    {
        var map = await GetQuoteMapAsync(assets, DisplayCurrency.Brl, cancellationToken).ConfigureAwait(false);

        return map.Values.ToList();
    }

    public Task<IReadOnlyDictionary<string, Quote>> GetQuoteMapAsync(
        IEnumerable<AssetRef> assets,
        CancellationToken cancellationToken = default) =>
        GetQuoteMapAsync(assets, DisplayCurrency.Brl, cancellationToken);

    public async Task<IReadOnlyDictionary<string, Quote>> GetQuoteMapAsync(
        IEnumerable<AssetRef> assets,
        DisplayCurrency currency,
        CancellationToken cancellationToken = default)
    {
        var list = assets
            .GroupBy(asset => asset.Key, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .ToList();

        if (list.Count == 0)
        {
            return new Dictionary<string, Quote>(StringComparer.OrdinalIgnoreCase);
        }

        var body = ApiJson.BuildQuotesBody(list, currency);
        var json = await _api.PostAsync("/api/app/quotes", body, cancellationToken).ConfigureAwait(false);

        return ApiJson.ParseQuotes(json).ToDictionary(quote => quote.Key, quote => quote, StringComparer.OrdinalIgnoreCase);
    }

    public async Task<Quote?> GetSingleQuoteAsync(AssetRef asset, CancellationToken cancellationToken = default)
    {
        var quotes = await GetQuotesAsync(new[] { asset }, cancellationToken).ConfigureAwait(false);

        return quotes.FirstOrDefault();
    }

    public async Task<Quote?> GetSingleQuoteAsync(
        AssetRef asset,
        DisplayCurrency currency,
        CancellationToken cancellationToken = default)
    {
        var quotes = await GetQuotesAsync(new[] { asset }, currency, cancellationToken).ConfigureAwait(false);

        return quotes.FirstOrDefault();
    }

    public Task<PriceHistory> GetHistoryAsync(
        AssetRef asset,
        MarketRange range,
        CancellationToken cancellationToken = default) =>
        GetHistoryAsync(asset, range, DisplayCurrency.Brl, cancellationToken);

    public async Task<PriceHistory> GetHistoryAsync(
        AssetRef asset,
        MarketRange range,
        DisplayCurrency currency,
        CancellationToken cancellationToken = default)
    {
        var path = $"/api/app/history?ticker={Uri.EscapeDataString(asset.Ticker)}" +
                   $"&type={asset.AssetType.ToDbValue()}" +
                   $"&range={range.ToUrlValue()}" +
                   $"&currency={currency.ToCode()}";

        if (!string.IsNullOrWhiteSpace(asset.CryptoId))
        {
            path += $"&cryptoId={Uri.EscapeDataString(asset.CryptoId!)}";
        }

        var json = await _api.GetAsync(path, cancellationToken).ConfigureAwait(false);

        return ApiJson.ParseHistory(json, asset);
    }

    public async Task<IReadOnlyList<AssetSearchResult>> SearchAsync(
        string query,
        CancellationToken cancellationToken = default)
    {
        // Busca é conveniência: sem rede o usuário digita o ticker direto.
        if (query.Trim().Length < 2)
        {
            return Array.Empty<AssetSearchResult>();
        }

        try
        {
            var json = await _api
                .GetAsync($"/api/app/search?q={Uri.EscapeDataString(query.Trim())}", cancellationToken)
                .ConfigureAwait(false);

            return ApiJson.ParseSearch(json);
        }
        catch (MarketDataException)
        {
            return Array.Empty<AssetSearchResult>();
        }
    }

    private async Task<IReadOnlyList<Quote>> GetQuotesAsync(
        IEnumerable<AssetRef> assets,
        DisplayCurrency currency,
        CancellationToken cancellationToken)
    {
        var map = await GetQuoteMapAsync(assets, currency, cancellationToken).ConfigureAwait(false);

        return map.Values.ToList();
    }
}
