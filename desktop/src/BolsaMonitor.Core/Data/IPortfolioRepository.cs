using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Core.Data;

/// <summary>
/// Contrato da carteira. Existe para que o app possa rodar em modo demonstração
/// (dados em memória) sem arrastar o Supabase, e para que a lógica de tela seja
/// testável sem rede.
/// </summary>
public interface IPortfolioRepository
{
    Task<IReadOnlyList<PortfolioRow>> ListAsync(CancellationToken cancellationToken = default);

    Task<PortfolioRow?> FindAsync(string ticker, AssetType assetType, CancellationToken cancellationToken = default);

    Task<PortfolioRow> InsertAsync(
        string ticker,
        AssetType assetType,
        string? cryptoId,
        decimal quantity,
        decimal? avgPrice,
        string? notes,
        CancellationToken cancellationToken = default);

    Task UpdateAsync(Guid id, decimal quantity, decimal? avgPrice, CancellationToken cancellationToken = default);

    Task DeleteAsync(Guid id, CancellationToken cancellationToken = default);
}
