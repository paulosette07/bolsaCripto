namespace BolsaMonitor.Core.Models;

/// <summary>
/// Regras de favorito compartilhadas por repositório, ViewModel e testes.
///
/// Favoritar não é comprar: a lista guarda apenas o ativo, sem quantidade nem
/// preço médio. Espelha <c>web/lib/favorites.ts</c>.
/// </summary>
public static class FavoriteRules
{
    /// <summary>
    /// Teto de favoritos por usuário — a grade de cards no Mercado precisa
    /// caber sem virar rolagem infinita.
    /// </summary>
    public const int MaxFavorites = 12;

    /// <summary>
    /// Chave estável do ativo, no mesmo formato de <see cref="Quote.Key"/>
    /// (`Stock:PETR4`). Igualar o formato permite casar favorito e cotação em
    /// um único dicionário, sem conversão no meio.
    /// </summary>
    public static string Key(AssetType assetType, string ticker) =>
        $"{assetType}:{ticker.Trim().ToUpperInvariant()}";

    /// <summary>
    /// O ativo já está na lista? A comparação é por tipo + ticker, igual à
    /// constraint unique da tabela `favorites`.
    /// </summary>
    public static bool IsFavorited(IEnumerable<FavoriteRow> favorites, AssetRef asset)
    {
        var target = Key(asset.AssetType, asset.Ticker);

        return favorites.Any(favorite => Key(
            AssetTypeExtensions.FromDbValue(favorite.AssetType),
            favorite.Ticker) == target);
    }
}
