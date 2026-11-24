using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Core.Market;

/// <summary>
/// Contrato de cotações usado pelas ViewModels. O modo demonstração implementa
/// esta interface sem rede; a produção usa <see cref="MarketService"/>.
/// </summary>
public interface IMarketService
{
    Task<AssetRef> ResolveAssetAsync(AssetRef asset, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<Quote>> GetQuotesAsync(IEnumerable<AssetRef> assets, CancellationToken cancellationToken = default);

    Task<IReadOnlyDictionary<string, Quote>> GetQuoteMapAsync(IEnumerable<AssetRef> assets, CancellationToken cancellationToken = default);

    /// <summary>
    /// Mapa na moeda pedida — usado pela faixa de favoritos, para os cards de
    /// cripto seguirem a moeda escolhida na tela. Bolsa continua em reais.
    /// </summary>
    Task<IReadOnlyDictionary<string, Quote>> GetQuoteMapAsync(
        IEnumerable<AssetRef> assets,
        DisplayCurrency currency,
        CancellationToken cancellationToken = default);

    Task<Quote?> GetSingleQuoteAsync(AssetRef asset, CancellationToken cancellationToken = default);

    Task<PriceHistory> GetHistoryAsync(AssetRef asset, MarketRange range, CancellationToken cancellationToken = default);

    /// <summary>
    /// Cotação na moeda pedida. Só cripto muda de moeda; ativos da B3 continuam
    /// em reais, porque converter por cima seria um número inventado.
    /// </summary>
    Task<Quote?> GetSingleQuoteAsync(AssetRef asset, DisplayCurrency currency, CancellationToken cancellationToken = default);

    /// <summary>Histórico na moeda pedida (cripto) ou em reais (bolsa).</summary>
    Task<PriceHistory> GetHistoryAsync(AssetRef asset, MarketRange range, DisplayCurrency currency, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<AssetSearchResult>> SearchAsync(string query, CancellationToken cancellationToken = default);
}
