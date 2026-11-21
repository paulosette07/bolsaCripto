using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Core.Data;

/// <summary>
/// Contrato dos alertas. Inclui o "claim" condicional que impede e-mail
/// duplicado entre desktop, cron da web e GitHub Actions.
/// </summary>
public interface IAlertRepository
{
    Task<IReadOnlyList<PriceAlertRow>> ListAsync(CancellationToken cancellationToken = default);

    Task<IReadOnlyList<PriceAlertRow>> ListActiveAsync(CancellationToken cancellationToken = default);

    Task<PriceAlertRow> CreateAsync(
        string ticker,
        AssetType assetType,
        string? cryptoId,
        string condition,
        decimal targetPrice,
        int cooldownMinutes,
        CancellationToken cancellationToken = default);

    Task SetActiveAsync(Guid id, bool isActive, CancellationToken cancellationToken = default);

    Task DeleteAsync(Guid id, CancellationToken cancellationToken = default);

    Task<bool> TryClaimAsync(Guid alertId, DateTimeOffset cutoff, CancellationToken cancellationToken = default);

    Task ReleaseClaimAsync(Guid alertId, DateTimeOffset? previousValue, CancellationToken cancellationToken = default);

    Task RecordCheckedPriceAsync(Guid alertId, decimal price, CancellationToken cancellationToken = default);

    Task InsertEventAsync(AlertEventRow alertEvent, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<AlertEventRow>> ListEventsAsync(int limit, CancellationToken cancellationToken = default);
}
