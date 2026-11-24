using BolsaMonitor.Core.Formatting;
using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Desktop.ViewModels;

/// <summary>
/// Um card da faixa de favoritos do Mercado.
///
/// Imutável de propósito: a cada mudança de favorito (ou de cotação) o
/// ViewModel recria a coleção. Menos estado mutável, menos card desatualizado.
/// </summary>
public sealed class FavoriteCardItem
{
    public FavoriteCardItem(FavoriteRow row, Quote? quote)
    {
        var assetType = AssetTypeExtensions.FromDbValue(row.AssetType);

        Ticker = row.Ticker;
        AssetType = assetType;
        CryptoId = row.CryptoId;
        Name = quote?.Name ?? (assetType == BolsaMonitor.Core.Models.AssetType.Crypto
            ? "Criptomoeda"
            : "Bolsa");
        HasQuote = quote is not null;
        PriceText = quote is null
            ? "—"
            : BrlFormat.Price(quote.Price, DisplayCurrencyExtensions.FromCode(quote.Currency));
        ChangePercent = quote?.ChangePercent ?? 0m;
        ChangeText = quote is null ? "sem cotação" : BrlFormat.Percent(quote.ChangePercent);
    }

    public string Ticker { get; }

    public AssetType AssetType { get; }

    public string? CryptoId { get; }

    public string Name { get; }

    public bool HasQuote { get; }

    public string PriceText { get; }

    public decimal ChangePercent { get; }

    public string ChangeText { get; }

    public AssetRef ToAssetRef() => new(Ticker, AssetType, CryptoId);
}
