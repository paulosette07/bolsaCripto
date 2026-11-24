using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Core.Data;

/// <summary>
/// Contrato dos favoritos do Mercado.
///
/// Existe pela mesma razão de <see cref="IPortfolioRepository"/>: o modo
/// demonstração roda em memória e os testes não dependem de rede.
/// </summary>
public interface IFavoriteRepository
{
    Task<IReadOnlyList<FavoriteRow>> ListAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Liga/desliga o favorito do ativo. Devolve <c>true</c> quando o ativo
    /// passou a estar favoritado. Estoura <see cref="InvalidOperationException"/>
    /// quando o teto de favoritos já foi atingido.
    /// </summary>
    Task<bool> ToggleAsync(AssetRef asset, CancellationToken cancellationToken = default);
}
