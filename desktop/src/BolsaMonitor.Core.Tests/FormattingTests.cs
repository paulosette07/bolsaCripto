using BolsaMonitor.Core.Formatting;
using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Core.Tests;

/// <summary>
/// Formatação pt-BR e leitura de números digitados. Sem estes testes, um app
/// aberto em máquina com cultura inglesa mostraria "R$ 1,234.56" — e o usuário
/// digitaria "38,50" achando que o campo aceitaria vírgula.
/// </summary>
public sealed class FormattingTests
{
    [Fact]
    public void Currency_UsaPadraoBrasileiro()
    {
        Assert.Equal("R$ 1.234,56", BrlFormat.Currency(1234.56m));
        Assert.Equal("R$ 0,00", BrlFormat.Currency(0m));
    }

    [Fact]
    public void SignedCurrency_MostraSinalExplicito()
    {
        Assert.Equal("+R$ 12,30", BrlFormat.SignedCurrency(12.3m));
        Assert.Equal("-R$ 4,00", BrlFormat.SignedCurrency(-4m));
        Assert.Equal("+R$ 0,00", BrlFormat.SignedCurrency(0m));
    }

    [Fact]
    public void Price_UsaMaisCasasParaValoresPequenos()
    {
        Assert.Equal("R$ 38,50", BrlFormat.Price(38.5m));
        Assert.Contains(",", BrlFormat.Price(0.000123m));
        Assert.Equal("R$ 125.000,00", BrlFormat.Price(125000m));
    }

    [Fact]
    public void Percent_MostraSinalEVideo()
    {
        Assert.Equal("+1,24%", BrlFormat.Percent(1.24m));
        Assert.Equal("-3,10%", BrlFormat.Percent(-3.1m));
        Assert.Equal("0,00%", BrlFormat.Percent(0m));
    }

    [Fact]
    public void Quantity_NaoMostraZerosARight()
    {
        Assert.Equal("0,035", BrlFormat.Quantity(0.035m));
        Assert.Equal("100", BrlFormat.Quantity(100m));
    }

    [Theory]
    [InlineData("38,50", 38.5)]
    [InlineData("38.50", 38.5)]
    [InlineData("1.234,56", 1234.56)]
    [InlineData("0,035", 0.035)]
    [InlineData(" 100 ", 100)]
    public void TryParseDecimal_AceitaVirgulaEPonto(string input, double expected)
    {
        Assert.True(BrlFormat.TryParseDecimal(input, out var value));
        Assert.Equal((decimal)expected, value);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("abc")]
    [InlineData(null)]
    public void TryParseDecimal_RejeitaTextoInvalido(string? input)
    {
        Assert.False(BrlFormat.TryParseDecimal(input, out _));
    }

    [Fact]
    public void TryParseDecimal_IgnoraSimboloDeMoeda()
    {
        Assert.True(BrlFormat.TryParseDecimal("R$ 42,10", out var value));
        Assert.Equal(42.1m, value);
    }

    [Fact]
    public void Price_EmDolarUsaSimboloUsd()
    {
        Assert.Equal("US$ 38,50", BrlFormat.Price(38.5m, DisplayCurrency.Usd));
        Assert.Equal("US$ 1.234,56", BrlFormat.Currency(1234.56m, DisplayCurrency.Usd));
        Assert.Equal("+US$ 12,30", BrlFormat.SignedCurrency(12.3m, DisplayCurrency.Usd));
    }

    [Fact]
    public void Price_EmRealContinuaIgualAoPadrao()
    {
        Assert.Equal(BrlFormat.Price(38.5m), BrlFormat.Price(38.5m, DisplayCurrency.Brl));
    }

    [Fact]
    public void CurrencyForAsset_MantemBolsaEmReal()
    {
        Assert.Equal(DisplayCurrency.Brl, DisplayCurrencyExtensions.ForAsset(AssetType.Stock, DisplayCurrency.Usd));
        Assert.Equal(DisplayCurrency.Usd, DisplayCurrencyExtensions.ForAsset(AssetType.Crypto, DisplayCurrency.Usd));
    }

    [Fact]
    public void FromCode_LeCodigoIsoSemDiferenciarCaixa()
    {
        Assert.Equal(DisplayCurrency.Usd, DisplayCurrencyExtensions.FromCode("usd"));
        Assert.Equal(DisplayCurrency.Brl, DisplayCurrencyExtensions.FromCode(null));
    }

    [Fact]
    public void RelativeTime_UsaTextoPtBr()
    {
        var now = DateTimeOffset.UtcNow;

        Assert.Equal("agora mesmo", BrlFormat.RelativeTime(now.AddSeconds(-5)));
        Assert.Equal("há 5 min", BrlFormat.RelativeTime(now.AddMinutes(-5)));
        Assert.Equal("há 1 hora", BrlFormat.RelativeTime(now.AddHours(-1)));
        Assert.Equal("há 3 dias", BrlFormat.RelativeTime(now.AddDays(-3)));
    }
}
