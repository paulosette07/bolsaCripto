using BolsaMonitor.Core.Models;

using Supabase.Postgrest;

namespace BolsaMonitor.Core.Data;

/// <summary>
/// Favoritos no Supabase.
///
/// Toda consulta filtra por `user_id` mesmo com RLS ativa — se a política for
/// afrouxada por engano, o app continua não vendo dados de outra conta.
/// </summary>
public sealed class FavoriteRepository : IFavoriteRepository
{
    private readonly SupabaseGateway _gateway;

    public FavoriteRepository(SupabaseGateway gateway)
    {
        _gateway = gateway;
    }

    public async Task<IReadOnlyList<FavoriteRow>> ListAsync(CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId();

        var response = await _gateway.Client
            .From<FavoriteRow>()
            .Where(row => row.UserId == userId)
            .Order(row => row.CreatedAt, Constants.Ordering.Ascending)
            .Get()
            .ConfigureAwait(false);

        cancellationToken.ThrowIfCancellationRequested();

        return response.Models;
    }

    public async Task<bool> ToggleAsync(AssetRef asset, CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId();
        var ticker = asset.Ticker.Trim().ToUpperInvariant();
        var dbType = asset.AssetType.ToDbValue();

        var existing = await FindAsync(userId, ticker, dbType, cancellationToken).ConfigureAwait(false);

        if (existing is not null)
        {
            await _gateway.Client
                .From<FavoriteRow>()
                .Where(row => row.Id == existing.Id)
                .Delete()
                .ConfigureAwait(false);

            cancellationToken.ThrowIfCancellationRequested();

            return false;
        }

        var current = await ListAsync(cancellationToken).ConfigureAwait(false);

        if (current.Count >= FavoriteRules.MaxFavorites)
        {
            throw new InvalidOperationException(
                $"Limite de {FavoriteRules.MaxFavorites} favoritos. Remova um para adicionar outro.");
        }

        var row = new FavoriteRow
        {
            UserId = userId,
            Ticker = ticker,
            AssetType = dbType,
            CryptoId = asset.CryptoId,
            CreatedAt = DateTimeOffset.UtcNow
        };

        await _gateway.Client
            .From<FavoriteRow>()
            .Insert(row)
            .ConfigureAwait(false);

        cancellationToken.ThrowIfCancellationRequested();

        return true;
    }

    private async Task<FavoriteRow?> FindAsync(
        Guid userId,
        string ticker,
        string dbType,
        CancellationToken cancellationToken)
    {
        var response = await _gateway.Client
            .From<FavoriteRow>()
            .Where(row => row.UserId == userId)
            .Where(row => row.Ticker == ticker)
            .Where(row => row.AssetType == dbType)
            .Limit(1)
            .Get()
            .ConfigureAwait(false);

        cancellationToken.ThrowIfCancellationRequested();

        return response.Models.FirstOrDefault();
    }

    private Guid RequireUserId()
    {
        var userId = _gateway.UserId;

        if (string.IsNullOrWhiteSpace(userId) || !Guid.TryParse(userId, out var parsed))
        {
            throw new InvalidOperationException("Sessão expirada. Entre novamente.");
        }

        return parsed;
    }
}
