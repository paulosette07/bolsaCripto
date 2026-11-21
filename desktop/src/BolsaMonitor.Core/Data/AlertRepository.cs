using BolsaMonitor.Core.Models;

using Supabase.Postgrest;

namespace BolsaMonitor.Core.Data;

/// <summary>
/// CRUD de alertas + o "claim" que evita e-mail duplicado.
///
/// O claim é um UPDATE condicional: só o processo que conseguir transicionar
/// `last_notified_at` do estado antigo para "agora" envia o e-mail. Como o
/// Postgres serializa UPDATE na mesma linha, o cron da web, o GitHub Actions e
/// este app nunca mandam dois e-mails do mesmo alerta.
/// </summary>
public sealed class AlertRepository : IAlertRepository
{
    private const string LastNotifiedColumn = "last_notified_at";

    private readonly SupabaseGateway _gateway;

    public AlertRepository(SupabaseGateway gateway)
    {
        _gateway = gateway;
    }

    public async Task<IReadOnlyList<PriceAlertRow>> ListAsync(CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId();

        var response = await _gateway.Client
            .From<PriceAlertRow>()
            .Where(row => row.UserId == userId)
            .Order(row => row.CreatedAt, Constants.Ordering.Descending)
            .Get()
            .ConfigureAwait(false);

        cancellationToken.ThrowIfCancellationRequested();

        return response.Models;
    }

    public async Task<IReadOnlyList<PriceAlertRow>> ListActiveAsync(CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId();

        var response = await _gateway.Client
            .From<PriceAlertRow>()
            .Where(row => row.UserId == userId)
            .Where(row => row.IsActive)
            .Get()
            .ConfigureAwait(false);

        cancellationToken.ThrowIfCancellationRequested();

        return response.Models;
    }

    public async Task<PriceAlertRow> CreateAsync(
        string ticker,
        AssetType assetType,
        string? cryptoId,
        string condition,
        decimal targetPrice,
        int cooldownMinutes,
        CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId();
        var now = DateTimeOffset.UtcNow;

        var row = new PriceAlertRow
        {
            UserId = userId,
            Ticker = ticker.Trim().ToUpperInvariant(),
            AssetType = assetType.ToDbValue(),
            CryptoId = cryptoId,
            Condition = condition,
            TargetPrice = targetPrice,
            CooldownMinutes = cooldownMinutes,
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now
        };

        var response = await _gateway.Client
            .From<PriceAlertRow>()
            .Insert(row)
            .ConfigureAwait(false);

        cancellationToken.ThrowIfCancellationRequested();

        return response.Models.FirstOrDefault() ?? row;
    }

    public async Task SetActiveAsync(Guid id, bool isActive, CancellationToken cancellationToken = default)
    {
        RequireUserId();

        await _gateway.Client
            .From<PriceAlertRow>()
            .Where(row => row.Id == id)
            .Set(row => row.IsActive, isActive)
            .Set(row => row.UpdatedAt, DateTimeOffset.UtcNow)
            .Update()
            .ConfigureAwait(false);

        cancellationToken.ThrowIfCancellationRequested();
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        RequireUserId();

        await _gateway.Client
            .From<PriceAlertRow>()
            .Where(row => row.Id == id)
            .Delete()
            .ConfigureAwait(false);

        cancellationToken.ThrowIfCancellationRequested();
    }

    /// <summary>
    /// Reserva o direito de notificar. `true` significa "este processo ganhou o
    /// alerta" — só então o e-mail deve sair.
    /// </summary>
    public async Task<bool> TryClaimAsync(
        Guid alertId,
        DateTimeOffset cutoff,
        CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        var cutoffIso = cutoff.ToUniversalTime().ToString("O");

        var claimedRecent = await _gateway.Client
            .From<PriceAlertRow>()
            .Where(row => row.Id == alertId)
            .Filter(LastNotifiedColumn, Constants.Operator.LessThan, cutoffIso)
            .Set(row => row.LastNotifiedAt, now)
            .Set(row => row.UpdatedAt, now)
            .Update()
            .ConfigureAwait(false);

        cancellationToken.ThrowIfCancellationRequested();

        if (claimedRecent.Models.Count > 0)
        {
            return true;
        }

        var claimedFirst = await _gateway.Client
            .From<PriceAlertRow>()
            .Where(row => row.Id == alertId)
            .Filter(LastNotifiedColumn, Constants.Operator.Is, "null")
            .Set(row => row.LastNotifiedAt, now)
            .Set(row => row.UpdatedAt, now)
            .Update()
            .ConfigureAwait(false);

        cancellationToken.ThrowIfCancellationRequested();

        return claimedFirst.Models.Count > 0;
    }

    /// <summary>Desfaz o claim quando o envio falhou, liberando a nova tentativa.</summary>
    public async Task ReleaseClaimAsync(Guid alertId, DateTimeOffset? previousValue, CancellationToken cancellationToken = default)
    {
        await _gateway.Client
            .From<PriceAlertRow>()
            .Where(row => row.Id == alertId)
            .Set(row => row.LastNotifiedAt, previousValue)
            .Update()
            .ConfigureAwait(false);

        cancellationToken.ThrowIfCancellationRequested();
    }

    public async Task RecordCheckedPriceAsync(Guid alertId, decimal price, CancellationToken cancellationToken = default)
    {
        await _gateway.Client
            .From<PriceAlertRow>()
            .Where(row => row.Id == alertId)
            .Set(row => row.LastCheckedPrice, price)
            .Update()
            .ConfigureAwait(false);

        cancellationToken.ThrowIfCancellationRequested();
    }

    public async Task InsertEventAsync(AlertEventRow alertEvent, CancellationToken cancellationToken = default)
    {
        await _gateway.Client
            .From<AlertEventRow>()
            .Insert(alertEvent)
            .ConfigureAwait(false);

        cancellationToken.ThrowIfCancellationRequested();
    }

    public async Task<IReadOnlyList<AlertEventRow>> ListEventsAsync(int limit, CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId();

        var response = await _gateway.Client
            .From<AlertEventRow>()
            .Where(row => row.UserId == userId)
            .Order(row => row.CreatedAt, Constants.Ordering.Descending)
            .Limit(limit)
            .Get()
            .ConfigureAwait(false);

        cancellationToken.ThrowIfCancellationRequested();

        return response.Models;
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
