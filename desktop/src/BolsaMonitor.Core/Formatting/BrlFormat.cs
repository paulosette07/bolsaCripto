using System.Globalization;

using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Core.Formatting;

/// <summary>
/// Formatação pt-BR usada em toda a interface do desktop.
///
/// Uma cultura explícita (em vez de `CultureInfo.CurrentCulture`) garante que
/// o app mostre "R$ 1.234,56" mesmo em uma máquina configurada em inglês.
/// </summary>
public static class BrlFormat
{
    public static readonly CultureInfo Culture = CultureInfo.GetCultureInfo("pt-BR");

    private static readonly Dictionary<DisplayCurrency, NumberFormatInfo> MoneyFormats = new()
    {
        [DisplayCurrency.Brl] = CreateMoneyFormat("R$"),
        [DisplayCurrency.Usd] = CreateMoneyFormat("US$")
    };

    private static NumberFormatInfo CreateMoneyFormat(string symbol) => new()
    {
        CurrencySymbol = symbol,
        CurrencyDecimalSeparator = ",",
        CurrencyGroupSeparator = ".",
        CurrencyPositivePattern = 2,
        CurrencyNegativePattern = 9
    };

    private static NumberFormatInfo MoneyFormat(DisplayCurrency currency) => MoneyFormats[currency];

    /// <summary>Valor na moeda pedida (padrão: reais), sem sinal forçado.</summary>
    public static string Currency(decimal value, DisplayCurrency currency = DisplayCurrency.Brl) =>
        value.ToString("C2", MoneyFormat(currency));

    /// <summary>Valor com sinal explícito, para variações e resultados.</summary>
    public static string SignedCurrency(decimal value, DisplayCurrency currency = DisplayCurrency.Brl) =>
        (value >= 0m ? "+" : "-") + Math.Abs(value).ToString("C2", MoneyFormat(currency));

    /// <summary>Preço com casas decimais proporcionais à magnitude.</summary>
    public static string Price(decimal value, DisplayCurrency currency = DisplayCurrency.Brl)
    {
        var decimals = value switch
        {
            0m => 2,
            >= 1000m => 2,
            >= 1m => 2,
            >= 0.01m => 4,
            _ => 6
        };

        return value.ToString("C" + decimals, MoneyFormat(currency));
    }

    public static string Percent(decimal value) => value.ToString("+0.00;-0.00;0.00", Culture) + "%";

    public static string PercentPlain(decimal value) => value.ToString("0.00", Culture) + "%";

    /// <summary>Quantidade sem zeros à direita (0,035 BTC / 100 cotas).</summary>
    public static string Quantity(decimal value)
    {
        var text = value.ToString("0.########", Culture);

        return text;
    }

    public static string DateTime(DateTimeOffset value) =>
        value.ToLocalTime().ToString("dd/MM/yyyy HH:mm", Culture);

    public static string RelativeTime(DateTimeOffset value)
    {
        var delta = System.DateTimeOffset.UtcNow - value.ToUniversalTime();

        if (delta < TimeSpan.Zero)
        {
            return "agora";
        }

        if (delta.TotalSeconds < 60)
        {
            return "agora mesmo";
        }

        if (delta.TotalMinutes < 60)
        {
            var minutes = (int)delta.TotalMinutes;

            return $"há {minutes} min";
        }

        if (delta.TotalHours < 24)
        {
            var hours = (int)delta.TotalHours;

            return hours == 1 ? "há 1 hora" : $"há {hours} horas";
        }

        var days = (int)delta.TotalDays;

        return days == 1 ? "ontem" : $"há {days} dias";
    }

    /// <summary>
    /// Converte texto digitado pelo usuário em decimal, aceitando vírgula
    /// (pt-BR) e ponto (en-US): "38,50" e "38.50" chegam ao mesmo número.
    /// </summary>
    public static bool TryParseDecimal(string? input, out decimal value)
    {
        value = 0m;

        if (string.IsNullOrWhiteSpace(input))
        {
            return false;
        }

        var text = input.Trim().Replace("R$", string.Empty, StringComparison.Ordinal).Trim();

        if (text.Contains(',') && text.Contains('.'))
        {
            // "1.234,56" -> ponto é separador de milhar.
            text = text.Replace(".", string.Empty, StringComparison.Ordinal);
        }

        text = text.Replace(',', '.');

        return decimal.TryParse(
            text,
            NumberStyles.AllowDecimalPoint | NumberStyles.AllowLeadingSign,
            CultureInfo.InvariantCulture,
            out value);
    }
}
