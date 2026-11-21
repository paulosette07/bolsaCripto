using System.Globalization;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;

using BolsaMonitor.Core.Formatting;

namespace BolsaMonitor.Desktop.Converters;

/// <summary>Base para conversores de uma via, sem a boilerplate de `ConvertBack`.</summary>
public abstract class OneWayConverter : IValueConverter
{
    public abstract object Convert(object? value, Type targetType, object? parameter, CultureInfo culture);

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        Binding.DoNothing;
}

/// <summary>decimal -> "R$ 1.234,56"</summary>
public sealed class CurrencyConverter : OneWayConverter
{
    public override object Convert(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        value is decimal amount ? BrlFormat.Currency(amount) : "—";
}

/// <summary>decimal -> preço com casas proporcionais (cripto mostra 4-6 casas).</summary>
public sealed class PriceConverter : OneWayConverter
{
    public override object Convert(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        value is decimal price ? BrlFormat.Price(price) : "—";
}

/// <summary>decimal -> "+R$ 12,30" / "-R$ 4,00"</summary>
public sealed class SignedCurrencyConverter : OneWayConverter
{
    public override object Convert(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        value is decimal amount ? BrlFormat.SignedCurrency(amount) : "—";
}

/// <summary>decimal -> "+1,24%"</summary>
public sealed class PercentConverter : OneWayConverter
{
    public override object Convert(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        value is decimal percent ? BrlFormat.Percent(percent) : "—";
}

/// <summary>decimal? -> percentual, com "—" quando desconhecido.</summary>
public sealed class NullablePercentConverter : OneWayConverter
{
    public override object Convert(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        value is decimal percent ? BrlFormat.Percent(percent) : "—";
}

/// <summary>decimal -> brush verde (alta) ou vermelha (queda).</summary>
public sealed class ChangeBrushConverter : OneWayConverter
{
    public override object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var brushKey = value is decimal change && change < 0m ? "DownBrush" : "UpBrush";

        return Application.Current.TryFindResource(brushKey) as Brush ?? Brushes.Gray;
    }
}

/// <summary>decimal? -> brush neutra quando nulo.</summary>
public sealed class ProfitBrushConverter : OneWayConverter
{
    public override object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var brushKey = value switch
        {
            decimal profit when profit > 0m => "UpBrush",
            decimal profit when profit < 0m => "DownBrush",
            _ => "InkFaintBrush"
        };

        return Application.Current.TryFindResource(brushKey) as Brush ?? Brushes.Gray;
    }
}

/// <summary>bool -> Visible/Collapsed.</summary>
public sealed class BoolToVisibilityConverter : OneWayConverter
{
    public override object Convert(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        value is true ? Visibility.Visible : Visibility.Collapsed;
}

/// <summary>bool -> Collapsed/Visible.</summary>
public sealed class InverseBoolToVisibilityConverter : OneWayConverter
{
    public override object Convert(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        value is true ? Visibility.Collapsed : Visibility.Visible;
}

/// <summary>null ou string vazia -> Collapsed.</summary>
public sealed class NullToVisibilityConverter : OneWayConverter
{
    public override object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var visible = value switch
        {
            null => false,
            string text => !string.IsNullOrWhiteSpace(text),
            _ => true
        };

        return visible ? Visibility.Visible : Visibility.Collapsed;
    }
}

/// <summary>Coleção/lista vazia -> Collapsed (para o estado vazio).</summary>
public sealed class CountToVisibilityConverter : OneWayConverter
{
    public override object Convert(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        value is int count && count > 0 ? Visibility.Visible : Visibility.Collapsed;
}

/// <summary>Inverte um booleano (para habilitar/desabilitar durante o carregamento).</summary>
public sealed class InverseBoolConverter : OneWayConverter
{
    public override object Convert(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        value is not true;
}

/// <summary>
/// Converte a comparação com o parâmetro em booleano — usado para marcar a
/// navegação ativa sem expor um booleano por item.
/// </summary>
public sealed class EqualsConverter : OneWayConverter
{
    public override object Convert(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        string.Equals(value?.ToString(), parameter?.ToString(), StringComparison.OrdinalIgnoreCase);
}

/// <summary>decimal -> largura proporcional (para a barra de alocação).</summary>
public sealed class WeightToWidthConverter : OneWayConverter
{
    public override object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var available = 220d;

        if (parameter is string raw && double.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed))
        {
            available = parsed;
        }

        var weight = value switch
        {
            decimal ratio => (double)ratio,
            double ratio => ratio,
            _ => 0d
        };

        return Math.Clamp(weight, 0d, 1d) * available;
    }
}
