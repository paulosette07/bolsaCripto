using System.Globalization;

using BolsaMonitor.Core.Models;

using LiveChartsCore;
using LiveChartsCore.SkiaSharpView;
using LiveChartsCore.SkiaSharpView.Painting;

using SkiaSharp;

namespace BolsaMonitor.Desktop.Charts;

/// <summary>
/// Constrói a série e os eixos do gráfico de preço.
///
/// O eixo X usa índices (0..n) com rótulos de data formatados, em vez de datas
/// no eixo: assim o espaçamento é uniforme mesmo com fins de semana e feriados
/// sem negociação, que de outra forma criariam buracos na linha.
/// </summary>
public static class PriceChartFactory
{
    private static readonly SKColor UpColor = SKColor.Parse("#10B981");
    private static readonly SKColor DownColor = SKColor.Parse("#EF4444");
    private static readonly SKColor AxisTextColor = SKColor.Parse("#6C7A74");
    private static readonly SKColor SeparatorColor = SKColor.Parse("#1D2A24");

    public static ISeries[] BuildSeries(IReadOnlyList<HistoryPoint> points, decimal changePercent)
    {
        if (points.Count == 0)
        {
            return Array.Empty<ISeries>();
        }

        var accent = changePercent < 0m ? DownColor : UpColor;

        return new ISeries[]
        {
            new LineSeries<double>
            {
                Values = points.Select(point => (double)point.Price).ToArray(),
                Stroke = new SolidColorPaint(accent, 2f),
                Fill = new SolidColorPaint(accent.WithAlpha(26)),
                GeometrySize = 0,
                LineSmoothness = 0.15,
                Name = "Preço"
            }
        };
    }

    public static Axis[] BuildXAxes(IReadOnlyList<HistoryPoint> points)
    {
        var labelStep = Math.Max(1, points.Count / 5);
        var labels = new Dictionary<int, string>();

        for (var index = 0; index < points.Count; index += labelStep)
        {
            labels[index] = FormatLabel(points[index].Timestamp);
        }

        // Garante o rótulo do último ponto (o mais informativo).
        if (points.Count > 0)
        {
            labels[points.Count - 1] = FormatLabel(points[^1].Timestamp);
        }

        return new Axis[]
        {
            new Axis
            {
                Labels = BuildLabelArray(points.Count, labels),
                LabelsPaint = new SolidColorPaint(AxisTextColor),
                TextSize = 10,
                SeparatorsPaint = null,
                TicksPaint = null,
                MinStep = Math.Max(1, labelStep)
            }
        };
    }

    public static Axis[] BuildYAxes(decimal min, decimal max)
    {
        return new Axis[]
        {
            new Axis
            {
                Labeler = value => FormatAxisValue((decimal)value),
                LabelsPaint = new SolidColorPaint(AxisTextColor),
                TextSize = 10,
                SeparatorsPaint = new SolidColorPaint(SeparatorColor) { StrokeThickness = 1 },
                MinLimit = (double)min,
                MaxLimit = (double)max
            }
        };
    }

    /// <summary>Faixa vertical com folga de 6% para a linha não encostar na borda.</summary>
    public static (decimal Min, decimal Max) ComputeRange(IReadOnlyList<HistoryPoint> points)
    {
        if (points.Count == 0)
        {
            return (0m, 1m);
        }

        var min = points.Min(point => point.Price);
        var max = points.Max(point => point.Price);

        if (min == max)
        {
            var pad = min == 0m ? 1m : Math.Abs(min) * 0.05m;

            return (min - pad, max + pad);
        }

        var slack = (max - min) * 0.06m;

        return (min - slack, max + slack);
    }

    public static string FormatAxisValue(decimal value) => value switch
    {
        >= 1000m => value.ToString("N0", CultureInfo.GetCultureInfo("pt-BR")),
        >= 1m => value.ToString("N2", CultureInfo.GetCultureInfo("pt-BR")),
        _ => value.ToString("N4", CultureInfo.GetCultureInfo("pt-BR"))
    };

    private static string FormatLabel(long unixMilliseconds)
    {
        var moment = DateTimeOffset.FromUnixTimeMilliseconds(unixMilliseconds).ToLocalTime();

        return moment.ToString("dd/MM", CultureInfo.GetCultureInfo("pt-BR"));
    }

    private static string[] BuildLabelArray(int count, IReadOnlyDictionary<int, string> labels)
    {
        var array = new string[count];

        for (var index = 0; index < count; index++)
        {
            array[index] = labels.TryGetValue(index, out var label) ? label : string.Empty;
        }

        return array;
    }
}
