using BolsaMonitor.Core.Alerts;

namespace BolsaMonitor.Core.Tests;

/// <summary>
/// Condição e cooldown decidem se um e-mail sai — os testes cobrem os limites
/// (preço exatamente no alvo, cooldown exatamente vencido).
/// </summary>
public sealed class AlertEvaluatorTests
{
    [Theory]
    [InlineData("above", 40, 40, true)]
    [InlineData("above", 40, 39.99, false)]
    [InlineData("above", 40, 41, true)]
    [InlineData("below", 40, 40, true)]
    [InlineData("below", 40, 40.01, false)]
    [InlineData("below", 40, 39, true)]
    public void IsConditionMet_RespeitaLimiteDoAlvo(string condition, decimal target, decimal price, bool expected)
    {
        Assert.Equal(expected, AlertEvaluator.IsConditionMet(condition, target, price));
    }

    [Fact]
    public void IsConditionMet_CondicaoDesconhecida_TrataComoAcima()
    {
        Assert.True(AlertEvaluator.IsConditionMet("qualquer", 10m, 11m));
        Assert.False(AlertEvaluator.IsConditionMet("qualquer", 10m, 9m));
    }

    [Fact]
    public void IsCooldownElapsed_NuncaNotificado_EhElegivel()
    {
        Assert.True(AlertEvaluator.IsCooldownElapsed(null, 60, DateTimeOffset.UtcNow));
    }

    [Fact]
    public void IsCooldownElapsed_AntesDoIntervalo_NaoEhElegivel()
    {
        var now = DateTimeOffset.UtcNow;

        Assert.False(AlertEvaluator.IsCooldownElapsed(now.AddMinutes(-30), 60, now));
    }

    [Fact]
    public void IsCooldownElapsed_NoLimiteDoIntervalo_EhElegivel()
    {
        var now = DateTimeOffset.UtcNow;

        Assert.True(AlertEvaluator.IsCooldownElapsed(now.AddMinutes(-60), 60, now));
    }

    [Fact]
    public void CooldownCutoff_RecuaPeloIntervaloConfigurado()
    {
        var now = new DateTimeOffset(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

        Assert.Equal(now.AddMinutes(-90), AlertEvaluator.CooldownCutoff(90, now));
    }

    [Fact]
    public void CooldownCutoff_IntervaloInvalido_NaoGeraJanelaZero()
    {
        var now = DateTimeOffset.UtcNow;

        // Cooldown 0 viraria "sempre elegível" e mandaria e-mail em looping.
        Assert.Equal(now.AddMinutes(-1), AlertEvaluator.CooldownCutoff(0, now));
    }

    [Theory]
    [InlineData(0, false)]
    [InlineData(-5, false)]
    [InlineData(0.01, true)]
    [InlineData(38.5, true)]
    [InlineData(2_000_000_000, false)]
    public void IsValidTargetPrice_RejeitaZeroNegativoEAbsurdo(decimal value, bool expected)
    {
        Assert.Equal(expected, AlertEvaluator.IsValidTargetPrice(value));
    }

    [Fact]
    public void IsValidTargetPrice_NuloEhInvalido()
    {
        Assert.False(AlertEvaluator.IsValidTargetPrice(null));
    }

    [Theory]
    [InlineData(4, false)]
    [InlineData(5, true)]
    [InlineData(10_080, true)]
    [InlineData(10_081, false)]
    public void IsValidCooldown_RespeitaFaixa(int minutes, bool expected)
    {
        Assert.Equal(expected, AlertEvaluator.IsValidCooldown(minutes));
    }

    [Fact]
    public void NormalizeCondition_AceitaVariacoesEAssumeAcima()
    {
        Assert.Equal(AlertEvaluator.Below, AlertEvaluator.NormalizeCondition("  BELOW "));
        Assert.Equal(AlertEvaluator.Above, AlertEvaluator.NormalizeCondition(null));
        Assert.Equal(AlertEvaluator.Above, AlertEvaluator.NormalizeCondition("qualquer"));
    }

    [Fact]
    public void DescribeCondition_UsaTextoPtBr()
    {
        Assert.Equal("caiu abaixo de", AlertEvaluator.DescribeCondition(AlertEvaluator.Below));
        Assert.Equal("subiu acima de", AlertEvaluator.DescribeCondition(AlertEvaluator.Above));
    }
}
