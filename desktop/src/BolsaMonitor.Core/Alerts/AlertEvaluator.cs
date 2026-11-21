using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Core.Alerts;

/// <summary>
/// Regras de disparo, sem I/O — o mesmo algoritmo de `web/lib/alerts/run.ts`.
/// Manter isso puro é o que permite testar cooldown e condição sem banco.
/// </summary>
public static class AlertEvaluator
{
    public const string Above = "above";
    public const string Below = "below";

    /// <summary>`above` dispara quando preço >= alvo; `below` quando preço <= alvo.</summary>
    public static bool IsConditionMet(string condition, decimal targetPrice, decimal currentPrice) =>
        string.Equals(condition, Below, StringComparison.OrdinalIgnoreCase)
            ? currentPrice <= targetPrice
            : currentPrice >= targetPrice;

    /// <summary>
    /// Verdadeiro quando já passou o cooldown desde o último aviso.
    /// Nunca notificado = sempre elegível.
    /// </summary>
    public static bool IsCooldownElapsed(DateTimeOffset? lastNotifiedAt, int cooldownMinutes, DateTimeOffset now)
    {
        if (lastNotifiedAt is null)
        {
            return true;
        }

        var cooldown = TimeSpan.FromMinutes(Math.Max(cooldownMinutes, 1));

        return now - lastNotifiedAt.Value >= cooldown;
    }

    /// <summary>Instante a partir do qual um alerta volta a ser elegível.</summary>
    public static DateTimeOffset CooldownCutoff(int cooldownMinutes, DateTimeOffset now) =>
        now - TimeSpan.FromMinutes(Math.Max(cooldownMinutes, 1));

    public static string DescribeCondition(string condition) =>
        string.Equals(condition, Below, StringComparison.OrdinalIgnoreCase) ? "caiu abaixo de" : "subiu acima de";

    public static string NormalizeCondition(string? condition) =>
        string.Equals(condition?.Trim(), Below, StringComparison.OrdinalIgnoreCase) ? Below : Above;

    /// <summary>Valida o preço-alvo digitado pelo usuário.</summary>
    public static bool IsValidTargetPrice(decimal? value) => value is > 0m and <= 1_000_000_000m;

    public static bool IsValidCooldown(int minutes) => minutes is >= 5 and <= 10_080;

    public static PriceAlertRow CreateDraft(
        Guid userId,
        string ticker,
        AssetType assetType,
        string? cryptoId,
        string condition,
        decimal targetPrice,
        int cooldownMinutes) =>
        new()
        {
            UserId = userId,
            Ticker = ticker.Trim().ToUpperInvariant(),
            AssetType = assetType.ToDbValue(),
            CryptoId = cryptoId,
            Condition = NormalizeCondition(condition),
            TargetPrice = targetPrice,
            CooldownMinutes = cooldownMinutes,
            IsActive = true
        };
}
