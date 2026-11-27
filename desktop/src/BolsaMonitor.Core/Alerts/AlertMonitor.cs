using BolsaMonitor.Core.Data;
using BolsaMonitor.Core.Email;
using BolsaMonitor.Core.Market;
using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Core.Alerts;

/// <summary>Resumo de uma rodada de verificação.</summary>
public sealed record AlertRunSummary(
    int Checked,
    int Triggered,
    int Sent,
    int Failed,
    string? LastError = null);

/// <summary>
/// Verifica os alertas ativos do usuário logado e envia e-mail quando a
/// condição é atingida.
///
/// O fluxo é o mesmo do servidor: cotar em lote → checar condição → reservar o
/// alerta com UPDATE condicional → enviar → registrar `alert_events`. Se o
/// envio falhar, o claim é desfeito para a próxima rodada tentar de novo.
/// </summary>
public sealed class AlertMonitor : IAlertRunner
{
    private readonly IAlertRepository _alerts;
    private readonly IMarketService _market;
    private readonly EmailDispatcher _email;
    private readonly SupabaseGateway _gateway;

    public AlertMonitor(
        IAlertRepository alerts,
        IMarketService market,
        EmailDispatcher email,
        SupabaseGateway gateway)
    {
        _alerts = alerts;
        _market = market;
        _email = email;
        _gateway = gateway;
    }

    public async Task<AlertRunSummary> RunOnceAsync(CancellationToken cancellationToken = default)
    {
        var recipient = _gateway.Email;

        if (string.IsNullOrWhiteSpace(recipient))
        {
            return new AlertRunSummary(0, 0, 0, 0, "Nenhuma sessão ativa.");
        }

        var activeAlerts = await _alerts.ListActiveAsync(cancellationToken).ConfigureAwait(false);

        if (activeAlerts.Count == 0)
        {
            return new AlertRunSummary(0, 0, 0, 0);
        }

        var quotes = await _market
            .GetQuoteMapAsync(activeAlerts.Select(alert => alert.ToAssetRef()), cancellationToken)
            .ConfigureAwait(false);

        var now = DateTimeOffset.UtcNow;
        var triggered = 0;
        var sent = 0;
        var failed = 0;
        string? lastError = null;

        foreach (var alert in activeAlerts)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var assetType = AssetTypeExtensions.FromDbValue(alert.AssetType);
            var key = $"{assetType}:{alert.Ticker.ToUpperInvariant()}";

            if (!quotes.TryGetValue(key, out var quote))
            {
                continue;
            }

            await _alerts.RecordCheckedPriceAsync(alert.Id, quote.Price, cancellationToken).ConfigureAwait(false);

            if (!AlertEvaluator.IsConditionMet(alert.Condition, alert.TargetPrice, quote.Price))
            {
                continue;
            }

            if (!AlertEvaluator.IsCooldownElapsed(alert.LastNotifiedAt, alert.CooldownMinutes, now))
            {
                continue;
            }

            triggered++;

            var cutoff = AlertEvaluator.CooldownCutoff(alert.CooldownMinutes, now);
            var claimed = await _alerts.TryClaimAsync(alert.Id, cutoff, cancellationToken).ConfigureAwait(false);

            if (!claimed)
            {
                // Outro processo (cron da web / GitHub Actions) já avisou.
                continue;
            }

            var message = AlertEmailBuilder.Build(recipient, alert, quote.Price, _gateway.FullName);
            var result = await _email.SendAsync(message, cancellationToken).ConfigureAwait(false);

            if (result.Success)
            {
                sent++;
            }
            else
            {
                failed++;
                lastError = result.Error;

                await _alerts
                    .ReleaseClaimAsync(alert.Id, alert.LastNotifiedAt, cancellationToken)
                    .ConfigureAwait(false);
            }

            await _alerts.InsertEventAsync(
                new AlertEventRow
                {
                    AlertId = alert.Id,
                    UserId = alert.UserId,
                    Ticker = alert.Ticker,
                    AssetType = alert.AssetType,
                    Condition = alert.Condition,
                    TargetPrice = alert.TargetPrice,
                    PriceAtTrigger = quote.Price,
                    SentVia = "desktop",
                    Provider = result.Provider,
                    Status = result.Success ? "sent" : "failed",
                    ErrorMessage = result.Error,
                    CreatedAt = DateTimeOffset.UtcNow
                },
                cancellationToken).ConfigureAwait(false);
        }

        return new AlertRunSummary(activeAlerts.Count, triggered, sent, failed, lastError);
    }
}
