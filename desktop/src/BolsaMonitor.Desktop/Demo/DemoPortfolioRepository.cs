using BolsaMonitor.Core.Data;
using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Desktop.Demo;

/// <summary>
/// Carteira em memória para o modo demonstração. Semeada com ativos de bolsa e
/// cripto para exercitar a tabela, a barra de alocação e o resumo de resultado.
/// </summary>
public sealed class DemoPortfolioRepository : IPortfolioRepository
{
    private static readonly Guid DemoUser = new("11111111-1111-1111-1111-111111111111");

    private readonly List<PortfolioRow> _rows = new()
    {
        Row("PETR4", "stock", null, 300m, 31.40m, "Compra escalonada em março"),
        Row("VALE3", "stock", null, 120m, 68.90m, null),
        Row("ITUB4", "stock", null, 400m, 27.15m, "Posição antiga, dividendo reinvestido"),
        Row("HGLG11", "stock", null, 60m, 158.20m, null),
        Row("BTC", "crypto", "bitcoin", 0.042m, 415000m, "DCA mensal")
    };

    public Task<IReadOnlyList<PortfolioRow>> ListAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<PortfolioRow>>(_rows.OrderBy(row => row.CreatedAt).ToList());

    public Task<PortfolioRow?> FindAsync(string ticker, AssetType assetType, CancellationToken cancellationToken = default)
    {
        var dbType = assetType.ToDbValue();
        var normalized = ticker.Trim().ToUpperInvariant();

        var found = _rows.FirstOrDefault(row =>
            row.AssetType == dbType &&
            string.Equals(row.Ticker, normalized, StringComparison.OrdinalIgnoreCase));

        return Task.FromResult(found);
    }

    public Task<PortfolioRow> InsertAsync(
        string ticker,
        AssetType assetType,
        string? cryptoId,
        decimal quantity,
        decimal? avgPrice,
        string? notes,
        CancellationToken cancellationToken = default)
    {
        var row = Row(ticker, assetType.ToDbValue(), cryptoId, quantity, avgPrice, notes);

        _rows.Add(row);

        return Task.FromResult(row);
    }

    public Task UpdateAsync(Guid id, decimal quantity, decimal? avgPrice, CancellationToken cancellationToken = default)
    {
        var index = _rows.FindIndex(row => row.Id == id);

        if (index >= 0)
        {
            _rows[index].Quantity = quantity;
            _rows[index].AvgPrice = avgPrice;
            _rows[index].UpdatedAt = DateTimeOffset.UtcNow;
        }

        return Task.CompletedTask;
    }

    public Task DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        _rows.RemoveAll(row => row.Id == id);

        return Task.CompletedTask;
    }

    private static PortfolioRow Row(
        string ticker,
        string assetType,
        string? cryptoId,
        decimal quantity,
        decimal? avgPrice,
        string? notes) =>
        new()
        {
            Id = Guid.NewGuid(),
            UserId = DemoUser,
            Ticker = ticker.ToUpperInvariant(),
            AssetType = assetType,
            CryptoId = cryptoId,
            Quantity = quantity,
            AvgPrice = avgPrice,
            Notes = notes,
            CreatedAt = DateTimeOffset.UtcNow.AddDays(-45),
            UpdatedAt = DateTimeOffset.UtcNow.AddDays(-2)
        };
}
