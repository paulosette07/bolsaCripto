using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Core.Tests;

/// <summary>
/// Regras de favorito. Sem estes testes, um ticker com caixa diferente ou o
/// mesmo símbolo em classes de ativo diferentes entraria duas vezes na lista —
/// e a estrela do Mercado apareceria apagada com o ativo já favoritado.
/// </summary>
public sealed class FavoriteRulesTests
{
    [Fact]
    public void Key_IgnoraCaixaEEspacosDoTicker()
    {
        Assert.Equal("Stock:PETR4", FavoriteRules.Key(AssetType.Stock, " petr4 "));
    }

    [Fact]
    public void Key_DistingueBolsaDeCripto()
    {
        Assert.NotEqual(
            FavoriteRules.Key(AssetType.Stock, "ETH"),
            FavoriteRules.Key(AssetType.Crypto, "ETH"));
    }

    [Fact]
    public void IsFavorited_EncontraAtivoGravadoNoBanco()
    {
        var favorites = new[] { Row("PETR4", "stock"), Row("BTC", "crypto") };

        Assert.True(FavoriteRules.IsFavorited(favorites, new AssetRef("petr4", AssetType.Stock, null)));
        Assert.True(FavoriteRules.IsFavorited(favorites, new AssetRef("BTC", AssetType.Crypto, "bitcoin")));
    }

    [Fact]
    public void IsFavorited_NaoConfundeMesmoTickerEmTiposDiferentes()
    {
        var favorites = new[] { Row("ETH", "crypto") };

        Assert.False(FavoriteRules.IsFavorited(favorites, new AssetRef("ETH", AssetType.Stock, null)));
        Assert.True(FavoriteRules.IsFavorited(favorites, new AssetRef("ETH", AssetType.Crypto, "ethereum")));
    }

    [Fact]
    public void IsFavorited_ListaVaziaNaoTemFavorito()
    {
        Assert.False(FavoriteRules.IsFavorited(Array.Empty<FavoriteRow>(), new AssetRef("VALE3", AssetType.Stock, null)));
    }

    private static FavoriteRow Row(string ticker, string assetType) => new()
    {
        Id = Guid.NewGuid(),
        Ticker = ticker.ToUpperInvariant(),
        AssetType = assetType,
        CreatedAt = DateTimeOffset.UtcNow
    };
}
