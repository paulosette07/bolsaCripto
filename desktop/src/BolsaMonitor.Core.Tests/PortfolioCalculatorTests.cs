using BolsaMonitor.Core.Models;
using BolsaMonitor.Core.Portfolio;

namespace BolsaMonitor.Core.Tests;

/// <summary>
/// A carteira é o número que o usuário mais confia na tela — estes testes travam
/// o comportamento de valor de mercado, lucro e merge de compras.
/// </summary>
public sealed class PortfolioCalculatorTests
{
    private static PortfolioRow Row(string ticker, string assetType, decimal quantity, decimal? avgPrice) =>
        new()
        {
            Id = Guid.NewGuid(),
            UserId = Guid.NewGuid(),
            Ticker = ticker,
            AssetType = assetType,
            Quantity = quantity,
            AvgPrice = avgPrice
        };

    private static Dictionary<string, Quote> Quotes(params Quote[] quotes) =>
        quotes.ToDictionary(quote => quote.Key, quote => quote);

    private static Quote Quote(string ticker, AssetType type, decimal price, decimal changePercent = 0m) =>
        new(ticker, type, null, ticker, price, changePercent, 0m, null, "BRL", null, DateTimeOffset.UtcNow);

    [Fact]
    public void Build_CalculaValorDeMercadoEPeso()
    {
        var rows = new[]
        {
            Row("PETR4", "stock", 100m, 30m),
            Row("VALE3", "stock", 50m, 60m)
        };

        var quotes = Quotes(
            Quote("PETR4", AssetType.Stock, 40m),
            Quote("VALE3", AssetType.Stock, 70m));

        var positions = PortfolioCalculator.Build(rows, quotes);

        Assert.Equal(2, positions.Count);

        var petro = positions.Single(position => position.Ticker == "PETR4");
        Assert.Equal(4000m, petro.MarketValue);
        Assert.Equal(3000m, petro.Cost);
        Assert.Equal(1000m, petro.Profit);
        Assert.True(petro.HasQuote);

        // 4000 de 7500 = 53,33%
        Assert.NotNull(petro.Weight);
        Assert.InRange(petro.Weight!.Value, 0.533m, 0.534m);

        // Ordenado por valor de mercado, maior primeiro.
        Assert.Equal("PETR4", positions[0].Ticker);
    }

    [Fact]
    public void Build_SemPrecoMedio_NaoInventaLucro()
    {
        var rows = new[] { Row("BTC", "crypto", 0.5m, null) };
        var quotes = Quotes(Quote("BTC", AssetType.Crypto, 300000m));

        var position = PortfolioCalculator.Build(rows, quotes).Single();

        Assert.Equal(150000m, position.MarketValue);
        Assert.Null(position.Profit);
        Assert.Null(position.ProfitPercent);
        Assert.Equal(0m, position.Cost);
    }

    [Fact]
    public void Build_SemCotacao_MarcaPosicaoEMantemValorZero()
    {
        var rows = new[] { Row("XPTO3", "stock", 10m, 5m) };

        var position = PortfolioCalculator.Build(rows, new Dictionary<string, Quote>()).Single();

        Assert.False(position.HasQuote);
        Assert.Equal(0m, position.MarketValue);
        Assert.Equal(50m, position.Cost);
    }

    [Fact]
    public void Summarize_SomaPatrimonioECusto()
    {
        var rows = new[]
        {
            Row("PETR4", "stock", 100m, 30m),
            Row("BTC", "crypto", 0.01m, 100000m)
        };

        var quotes = Quotes(
            Quote("PETR4", AssetType.Stock, 40m),
            Quote("BTC", AssetType.Crypto, 200000m));

        var positions = PortfolioCalculator.Build(rows, quotes);
        var summary = PortfolioCalculator.Summarize(positions);

        Assert.Equal(2, summary.PositionsCount);
        Assert.Equal(6000m, summary.TotalValue);   // 4000 + 2000
        Assert.Equal(4000m, summary.TotalCost);    // 3000 + 1000
        Assert.Equal(2000m, summary.TotalProfit);
        Assert.Equal(50m, summary.TotalProfitPercent); // 2000 / 4000
        Assert.Equal(4000m, summary.StockValue);
        Assert.Equal(2000m, summary.CryptoValue);
    }

    [Fact]
    public void Summarize_CarteiraVazia_NaoDividePorZero()
    {
        var summary = PortfolioCalculator.Summarize(Array.Empty<PositionView>());

        Assert.Equal(0m, summary.TotalValue);
        Assert.Null(summary.TotalProfitPercent);
        Assert.Equal(0m, summary.DayChangePercent);
    }

    [Fact]
    public void Merge_SomaQuantidadeEPonderaPrecoMedio()
    {
        var (quantity, avgPrice) = PortfolioCalculator.Merge(
            currentQuantity: 100m,
            currentAvgPrice: 30m,
            addedQuantity: 50m,
            addedAvgPrice: 60m);

        Assert.Equal(150m, quantity);
        // (100*30 + 50*60) / 150 = 6000/150 = 40
        Assert.Equal(40m, avgPrice);
    }

    [Fact]
    public void Merge_PrimeiraCompra_UsaOProprioPreco()
    {
        var (quantity, avgPrice) = PortfolioCalculator.Merge(0m, null, 2m, 10m);

        Assert.Equal(2m, quantity);
        Assert.Equal(10m, avgPrice);
    }

    [Fact]
    public void Merge_HistoricoSemCusto_AdotaPrecoDaCompraNova()
    {
        // Diluír o custo antigo para zero faria a tela mostrar lucro que não existe.
        var (quantity, avgPrice) = PortfolioCalculator.Merge(100m, null, 50m, 60m);

        Assert.Equal(150m, quantity);
        Assert.Equal(60m, avgPrice);
    }

    [Fact]
    public void Merge_CompraSemPreco_PreservaCustoMedioAnterior()
    {
        var (quantity, avgPrice) = PortfolioCalculator.Merge(5m, 30m, 5m, null);

        Assert.Equal(10m, quantity);
        Assert.Equal(30m, avgPrice);
    }

    [Fact]
    public void Merge_SemPrecoMedioNenhum_MantemNulo()
    {
        var (quantity, avgPrice) = PortfolioCalculator.Merge(5m, null, 5m, null);

        Assert.Equal(10m, quantity);
        Assert.Null(avgPrice);
    }

    [Fact]
    public void Summarize_CalculaVariacaoDoDiaComSinalCorreto()
    {
        var rows = new[] { Row("PETR4", "stock", 100m, 30m) };
        var quotes = Quotes(Quote("PETR4", AssetType.Stock, 40m, changePercent: 10m));

        var positions = PortfolioCalculator.Build(rows, quotes);
        var summary = PortfolioCalculator.Summarize(positions);

        // Preço anterior 36,36 -> 100 cotas = 363,63 de alta no dia.
        Assert.InRange(summary.DayChangeValue, 363m, 364m);
        Assert.True(summary.DayChangePercent > 9m);
    }
}
