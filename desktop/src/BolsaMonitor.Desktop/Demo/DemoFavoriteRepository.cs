using BolsaMonitor.Core.Data;
using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Desktop.Demo;

/// <summary>
/// Favoritos em memória para o modo demonstração: três ativos já marcados para
/// a faixa de cards do Mercado aparecer preenchida sem Supabase.
/// </summary>
public sealed class DemoFavoriteRepository : IFavoriteRepository
{
    private static readonly Guid DemoUser = new("11111111-1111-1111-1111-111111111111");

    private readonly List<FavoriteRow> _rows = new()
    {
        Row("PETR4", "stock", null, -6),
        Row("VALE3", "stock", null, -4),
        Row("BTC", "crypto", "bitcoin", -2)
    };

    public Task<IReadOnlyList<FavoriteRow>> ListAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<FavoriteRow>>(_rows.OrderBy(row => row.CreatedAt).ToList());

    public Task<bool> ToggleAsync(AssetRef asset, CancellationToken cancellationToken = default)
    {
        var ticker = asset.Ticker.Trim().ToUpperInvariant();
        var dbType = asset.AssetType.ToDbValue();

        var existing = _rows.FirstOrDefault(row =>
            row.AssetType == dbType &&
            string.Equals(row.Ticker, ticker, StringComparison.OrdinalIgnoreCase));

        if (existing is not null)
        {
            _rows.Remove(existing);

            return Task.FromResult(false);
        }

        if (_rows.Count >= FavoriteRules.MaxFavorites)
        {
            throw new InvalidOperationException(
                $"Limite de {FavoriteRules.MaxFavorites} favoritos. Remova um para adicionar outro.");
        }

        _rows.Add(Row(ticker, dbType, asset.CryptoId, 0));

        return Task.FromResult(true);
    }

    private static FavoriteRow Row(string ticker, string assetType, string? cryptoId, int daysAgo) =>
        new()
        {
            Id = Guid.NewGuid(),
            UserId = DemoUser,
            Ticker = ticker.ToUpperInvariant(),
            AssetType = assetType,
            CryptoId = cryptoId,
            CreatedAt = DateTimeOffset.UtcNow.AddDays(daysAgo)
        };
}
