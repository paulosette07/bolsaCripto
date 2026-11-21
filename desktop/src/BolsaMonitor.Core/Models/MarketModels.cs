namespace BolsaMonitor.Core.Models;

/// <summary>Tipo de ativo. Espelha o enum `asset_type` do Postgres.</summary>
public enum AssetType
{
    Stock,
    Crypto
}

/// <summary>Intervalo de histórico suportado pelos dois provedores.</summary>
public enum MarketRange
{
    OneDay,
    FiveDays,
    OneMonth,
    ThreeMonths,
    SixMonths,
    OneYear,
    Max
}

/// <summary>
/// Moeda de exibição de uma cotação.
///
/// A B3 negocia em reais; cripto tem preço nativo em dólar. Espelha o tipo
/// `Currency` da web (`'BRL' | 'USD'`).
/// </summary>
public enum DisplayCurrency
{
    Brl,
    Usd
}

public static class DisplayCurrencyExtensions
{
    /// <summary>`brl` / `usd` — valor aceito pelo parâmetro vs_currency da CoinGecko.</summary>
    public static string ToApiValue(this DisplayCurrency currency) =>
        currency == DisplayCurrency.Usd ? "usd" : "brl";

    /// <summary>`BRL` / `USD` — código ISO guardado em <see cref="Quote.Currency"/>.</summary>
    public static string ToCode(this DisplayCurrency currency) =>
        currency == DisplayCurrency.Usd ? "USD" : "BRL";

    /// <summary>`R$` / `US$`.</summary>
    public static string ToSymbol(this DisplayCurrency currency) =>
        currency == DisplayCurrency.Usd ? "US$" : "R$";

    public static string ToDisplayLabel(this DisplayCurrency currency) =>
        currency == DisplayCurrency.Usd ? "Dólar" : "Real";

    /// <summary>Bolsa é sempre em reais; só cripto aceita trocar a moeda.</summary>
    public static DisplayCurrency ForAsset(AssetType assetType, DisplayCurrency requested) =>
        assetType == AssetType.Crypto ? requested : DisplayCurrency.Brl;

    public static DisplayCurrency FromCode(string? code) =>
        string.Equals(code, "USD", StringComparison.OrdinalIgnoreCase) ? DisplayCurrency.Usd : DisplayCurrency.Brl;
}

/// <summary>Identificador mínimo de um ativo, para cotar/historicar.</summary>
public sealed record AssetRef(string Ticker, AssetType AssetType, string? CryptoId)
{
    public string Key => $"{AssetType}:{Ticker.ToUpperInvariant()}";
}

/// <summary>
/// Cotação normalizada. Mesmos campos que o contrato TypeScript da web,
/// para que as duas aplicações exibam exatamente a mesma informação.
/// </summary>
public sealed record Quote(
    string Ticker,
    AssetType AssetType,
    string? CryptoId,
    string Name,
    decimal Price,
    decimal ChangePercent,
    decimal ChangeValue,
    decimal? PreviousClose,
    string Currency,
    string? LogoUrl,
    DateTimeOffset UpdatedAt)
{
    public string Key => $"{AssetType}:{Ticker.ToUpperInvariant()}";
}

/// <summary>Ponto de histórico (epoch em ms).</summary>
public readonly record struct HistoryPoint(long Timestamp, decimal Price);

/// <summary>Série histórica de um ativo.</summary>
public sealed record PriceHistory(
    string Ticker,
    AssetType AssetType,
    string? CryptoId,
    IReadOnlyList<HistoryPoint> Points,
    string Currency = "BRL")
{
    public static PriceHistory Empty(AssetRef asset) =>
        new(asset.Ticker, asset.AssetType, asset.CryptoId, Array.Empty<HistoryPoint>());
}

/// <summary>Resultado de busca (usado no autocomplete).</summary>
public sealed record AssetSearchResult(string Ticker, AssetType AssetType, string? CryptoId, string Name, string? LogoUrl);

/// <summary>Mapeia o enum para o valor textual usado no banco e nas APIs.</summary>
public static class AssetTypeExtensions
{
    public static string ToDbValue(this AssetType assetType) => assetType == AssetType.Crypto ? "crypto" : "stock";

    public static AssetType FromDbValue(string? value) =>
        string.Equals(value, "crypto", StringComparison.OrdinalIgnoreCase) ? AssetType.Crypto : AssetType.Stock;

    public static string ToUrlValue(this MarketRange range) => range switch
    {
        MarketRange.OneDay => "1d",
        MarketRange.FiveDays => "5d",
        MarketRange.OneMonth => "1mo",
        MarketRange.ThreeMonths => "3mo",
        MarketRange.SixMonths => "6mo",
        MarketRange.OneYear => "1y",
        _ => "max"
    };

    public static string ToLabel(this MarketRange range) => range switch
    {
        MarketRange.OneDay => "1D",
        MarketRange.FiveDays => "5D",
        MarketRange.OneMonth => "1M",
        MarketRange.ThreeMonths => "3M",
        MarketRange.SixMonths => "6M",
        MarketRange.OneYear => "1A",
        _ => "Máx"
    };
}
