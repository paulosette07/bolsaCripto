using BolsaMonitor.Core.Models;

using Supabase.Postgrest;

namespace BolsaMonitor.Core.Data;

/// <summary>
/// CRUD da carteira no Supabase.
///
/// Toda consulta filtra por `user_id` mesmo com RLS ativa: se a política for
/// afrouxada por engano, o app continua não vendo dados de outra conta.
/// </summary>
public sealed class PortfolioRepository : IPortfolioRepository
{
    private readonly SupabaseGateway _gateway;

    public PortfolioRepository(SupabaseGateway gateway)
    {
        _gateway = gateway;
    }

    public async Task<IReadOnlyList<PortfolioRow>> ListAsync(CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId();

        var response = await _gateway.Client
            .From<PortfolioRow>()
            .Where(row => row.UserId == userId)
            .Order(row => row.CreatedAt, Constants.Ordering.Ascending)
            .Get()
            .ConfigureAwait(false);

        cancellationToken.ThrowIfCancellationRequested();

        return response.Models;
    }

    public async Task<PortfolioRow?> FindAsync(string ticker, AssetType assetType, CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId();
        var dbType = assetType.ToDbValue();
        var normalized = ticker.Trim().ToUpperInvariant();

        var response = await _gateway.Client
            .From<PortfolioRow>()
            .Where(row => row.UserId == userId)
            .Where(row => row.Ticker == normalized)
            .Where(row => row.AssetType == dbType)
            .Limit(1)
            .Get()
            .ConfigureAwait(false);

        cancellationToken.ThrowIfCancellationRequested();

        return response.Models.FirstOrDefault();
    }

    public async Task<PortfolioRow> InsertAsync(
        string ticker,
        AssetType assetType,
        string? cryptoId,
        decimal quantity,
        decimal? avgPrice,
        string? notes,
        CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId();
        var now = DateTimeOffset.UtcNow;

        var row = new PortfolioRow
        {
            UserId = userId,
            Ticker = ticker.Trim().ToUpperInvariant(),
            AssetType = assetType.ToDbValue(),
            CryptoId = cryptoId,
            Quantity = quantity,
            AvgPrice = avgPrice,
            Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim(),
            CreatedAt = now,
            UpdatedAt = now
        };

        var response = await _gateway.Client
            .From<PortfolioRow>()
            .Insert(row)
            .ConfigureAwait(false);

        cancellationToken.ThrowIfCancellationRequested();

        return response.Models.FirstOrDefault() ?? row;
    }

    public async Task UpdateAsync(
        Guid id,
        decimal quantity,
        decimal? avgPrice,
        CancellationToken cancellationToken = default)
    {
        RequireUserId();

        await _gateway.Client
            .From<PortfolioRow>()
            .Where(row => row.Id == id)
            .Set(row => row.Quantity, quantity)
            .Set(row => row.AvgPrice, avgPrice)
            .Set(row => row.UpdatedAt, DateTimeOffset.UtcNow)
            .Update()
            .ConfigureAwait(false);

        cancellationToken.ThrowIfCancellationRequested();
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        RequireUserId();

        await _gateway.Client
            .From<PortfolioRow>()
            .Where(row => row.Id == id)
            .Delete()
            .ConfigureAwait(false);

        cancellationToken.ThrowIfCancellationRequested();
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
