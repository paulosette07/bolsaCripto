using BolsaMonitor.Core.Data;
using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Desktop.Demo;

/// <summary>
/// Alertas em memória para o modo demonstração.
///
/// `TryClaimAsync` sempre devolve verdadeiro: existe um único processo, então não
/// há concorrência real a arbitrar — o claim de produção é o do Supabase.
/// </summary>
public sealed class DemoAlertRepository : IAlertRepository
{
    private static readonly Guid DemoUser = new("11111111-1111-1111-1111-111111111111");

    private readonly List<PriceAlertRow> _alerts = new()
    {
        Alert("PETR4", "stock", null, "above", 40m, 60, notifiedHoursAgo: null),
        Alert("VALE3", "stock", null, "below", 60m, 240, notifiedHoursAgo: 30),
        Alert("BTC", "crypto", "bitcoin", "above", 600000m, 1440, notifiedHoursAgo: 6)
    };

    private readonly List<AlertEventRow> _events = new()
    {
        Event("PETR4", "stock", "above", 39.50m, 39.62m, "sent", hoursAgo: 8),
        Event("BTC", "crypto", "above", 590000m, 601240m, "sent", hoursAgo: 6),
        Event("VALE3", "stock", "below", 62m, 61.90m, "failed", hoursAgo: 30)
    };

    public Task<IReadOnlyList<PriceAlertRow>> ListAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<PriceAlertRow>>(
            _alerts.OrderByDescending(row => row.CreatedAt).ToList());

    public Task<IReadOnlyList<PriceAlertRow>> ListActiveAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<PriceAlertRow>>(_alerts.Where(row => row.IsActive).ToList());

    public Task<PriceAlertRow> CreateAsync(
        string ticker,
        AssetType assetType,
        string? cryptoId,
        string condition,
        decimal targetPrice,
        int cooldownMinutes,
        CancellationToken cancellationToken = default)
    {
        var row = Alert(ticker, assetType.ToDbValue(), cryptoId, condition, targetPrice, cooldownMinutes, null);

        _alerts.Insert(0, row);

        return Task.FromResult(row);
    }

    public Task SetActiveAsync(Guid id, bool isActive, CancellationToken cancellationToken = default)
    {
        var row = _alerts.FirstOrDefault(alert => alert.Id == id);

        if (row is not null)
        {
            row.IsActive = isActive;
            row.UpdatedAt = DateTimeOffset.UtcNow;
        }

        return Task.CompletedTask;
    }

    public Task DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        _alerts.RemoveAll(alert => alert.Id == id);

        return Task.CompletedTask;
    }

    public Task<bool> TryClaimAsync(Guid alertId, DateTimeOffset cutoff, CancellationToken cancellationToken = default)
    {
        var row = _alerts.FirstOrDefault(alert => alert.Id == alertId);

        if (row is null)
        {
            return Task.FromResult(false);
        }

        row.LastNotifiedAt = DateTimeOffset.UtcNow;
        row.UpdatedAt = DateTimeOffset.UtcNow;

        return Task.FromResult(true);
    }

    public Task ReleaseClaimAsync(Guid alertId, DateTimeOffset? previousValue, CancellationToken cancellationToken = default)
    {
        var row = _alerts.FirstOrDefault(alert => alert.Id == alertId);

        if (row is not null)
        {
            row.LastNotifiedAt = previousValue;
        }

        return Task.CompletedTask;
    }

    public Task RecordCheckedPriceAsync(Guid alertId, decimal price, CancellationToken cancellationToken = default)
    {
        var row = _alerts.FirstOrDefault(alert => alert.Id == alertId);

        if (row is not null)
        {
            row.LastCheckedPrice = price;
        }

        return Task.CompletedTask;
    }

    public Task InsertEventAsync(AlertEventRow alertEvent, CancellationToken cancellationToken = default)
    {
        _events.Insert(0, alertEvent);

        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<AlertEventRow>> ListEventsAsync(int limit, CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<AlertEventRow>>(
            _events.OrderByDescending(row => row.CreatedAt).Take(limit).ToList());

    private static PriceAlertRow Alert(
        string ticker,
        string assetType,
        string? cryptoId,
        string condition,
        decimal targetPrice,
        int cooldownMinutes,
        int? notifiedHoursAgo) =>
        new()
        {
            Id = Guid.NewGuid(),
            UserId = DemoUser,
            Ticker = ticker.ToUpperInvariant(),
            AssetType = assetType,
            CryptoId = cryptoId,
            Condition = condition,
            TargetPrice = targetPrice,
            CooldownMinutes = cooldownMinutes,
            IsActive = true,
            LastNotifiedAt = notifiedHoursAgo is null
                ? null
                : DateTimeOffset.UtcNow.AddHours(-notifiedHoursAgo.Value),
            CreatedAt = DateTimeOffset.UtcNow.AddDays(-20),
            UpdatedAt = DateTimeOffset.UtcNow.AddDays(-1)
        };

    private static AlertEventRow Event(
        string ticker,
        string assetType,
        string condition,
        decimal targetPrice,
        decimal priceAtTrigger,
        string status,
        int hoursAgo) =>
        new()
        {
            Id = Guid.NewGuid(),
            UserId = DemoUser,
            Ticker = ticker.ToUpperInvariant(),
            AssetType = assetType,
            Condition = condition,
            TargetPrice = targetPrice,
            PriceAtTrigger = priceAtTrigger,
            SentVia = "desktop",
            Provider = status == "sent" ? "resend" : null,
            Status = status,
            ErrorMessage = status == "sent" ? null : "Domínio de envio ainda não verificado no Resend.",
            CreatedAt = DateTimeOffset.UtcNow.AddHours(-hoursAgo)
        };
}
