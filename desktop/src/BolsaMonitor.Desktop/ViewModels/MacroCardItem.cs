using BolsaMonitor.Core.Formatting;
using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Desktop.ViewModels;

/// <summary>
/// Linha formatada de indicador macro, pronta para o XAML.
///
/// A formatação mora aqui (e não no conversor) porque cada indicador tem sua
/// unidade: reais para câmbio, reais por grama para o ouro e pontos para índice.
/// </summary>
public sealed record MacroCardItem(
    string Label,
    string ValueText,
    string Subtitle,
    string? RangeText,
    decimal ChangePercent)
{
    public static MacroCardItem FromQuote(MacroQuote quote)
    {
        var detail = quote.UsdPerOunce is { } ounce
            ? $"{BrlFormat.Price(ounce, DisplayCurrency.Usd)}/onça"
            : quote.Subtitle;

        return new MacroCardItem(
            quote.Label,
            FormatValue(quote),
            detail,
            FormatRange(quote),
            quote.ChangePercent);
    }

    private static string FormatValue(MacroQuote quote) => quote.Unit switch
    {
        MacroUnit.Currency => BrlFormat.Price(quote.Value),
        MacroUnit.GoldGram => BrlFormat.Currency(quote.Value),
        _ => quote.Value.ToString("N0", BrlFormat.Culture) + " pts"
    };

    private static string? FormatRange(MacroQuote quote)
    {
        if (quote.DayLow is not { } low || quote.DayHigh is not { } high)
        {
            return null;
        }

        return quote.Unit == MacroUnit.Index
            ? $"mín {low.ToString("N0", BrlFormat.Culture)} · máx {high.ToString("N0", BrlFormat.Culture)}"
            : $"mín {BrlFormat.Price(low)} · máx {BrlFormat.Price(high)}";
    }
}

/// <summary>Juros/inflação já formatados para a tela.</summary>
public sealed record MacroRateItem(string Label, string ValueText, string Detail)
{
    public static MacroRateItem FromRate(MacroRate rate) =>
        new(
            rate.Label,
            $"{rate.Value.ToString("0.00", BrlFormat.Culture)}% a.a.",
            rate.ReferenceDate is { } date
                ? $"{rate.Note} · {date:dd/MM/yyyy}"
                : rate.Note);
}
