using System.Globalization;
using System.Windows;
using System.Windows.Media;

using BolsaMonitor.Core.Market;
using BolsaMonitor.Core.Models;

using CommunityToolkit.Mvvm.ComponentModel;

namespace BolsaMonitor.Desktop.ViewModels;

/// <summary>
/// Faixa fixa do dólar comercial — a mesma informação que a web mostra no topo,
/// presente em todas as telas do desktop, inclusive no login.
///
/// Não é um `PageViewModel`: não tem título, não navega, só se atualiza. Por
/// isso vive fora da navegação e é consumida tanto pela shell quanto pela janela
/// de entrada.
/// </summary>
public sealed partial class RateTickerViewModel : ObservableObject
{
    private static readonly CultureInfo PtBr = CultureInfo.GetCultureInfo("pt-BR");

    private readonly IUsdRateService _rates;

    private DateTimeOffset? _lastReadAt;

    public RateTickerViewModel(IUsdRateService rates)
    {
        _rates = rates;
    }

    /// <summary>`US$ 1 = R$ 5,42`</summary>
    [ObservableProperty]
    private string _rateText = "—";

    /// <summary>`+0,42%` ou `-0,18%`; vazio quando a fonte não dá variação.</summary>
    [ObservableProperty]
    private string _changeText = string.Empty;

    /// <summary>Tooltip: origem do dado e hora da leitura.</summary>
    [ObservableProperty]
    private string _detailText = "Dólar comercial · aguardando cotação";

    [ObservableProperty]
    private Brush _changeBrush = Brushes.Gray;

    /// <summary>Atualiza com a cotação mais recente; falha mantém o último valor.</summary>
    public async Task RefreshAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            var snapshot = await _rates.GetAsync(cancellationToken).ConfigureAwait(true);

            if (snapshot is null)
            {
                // Sem número novo: preserva o que está na tela e só ajusta o
                // tooltip. A faixa é enfeite de topo — não interrompe o usuário.
                DetailText = _lastReadAt is { } last
                    ? $"Dólar comercial · sem atualização agora · última leitura {last.ToLocalTime():HH:mm}"
                    : "Dólar comercial · cotação indisponível agora";

                return;
            }

            Apply(snapshot);
        }
        catch (Exception)
        {
            // Sem rede a tela continua utilizável e o último número permanece.
        }
    }

    private void Apply(UsdRateSnapshot snapshot)
    {
        _lastReadAt = snapshot.FetchedAt;

        RateText = $"US$ 1 = R$ {snapshot.Rate.ToString("N2", PtBr)}";

        if (snapshot.ChangePercent is { } percent)
        {
            var sign = percent > 0 ? "+" : string.Empty;

            ChangeText = $"{sign}{percent.ToString("N2", PtBr)}%";
            ChangeBrush = percent switch
            {
                > 0 => LookupBrush("UpBrush", Colors.SeaGreen),
                < 0 => LookupBrush("DownBrush", Colors.IndianRed),
                _ => LookupBrush("InkMutedBrush", Colors.Gray)
            };
        }
        else
        {
            ChangeText = string.Empty;
            ChangeBrush = Brushes.Gray;
        }

        var source = snapshot.Source switch
        {
            "bcb" => "Banco Central",
            "awesomeapi" => "AwesomeAPI",
            "yahoo" => "Yahoo Finance",
            _ => "Bolsa Monitor"
        };

        var reference = snapshot.ReferenceDate is { } date
            ? $" · referência {date:dd/MM}"
            : string.Empty;

        DetailText =
            $"Dólar comercial · {source}{reference} · lido às {snapshot.FetchedAt.ToLocalTime():HH:mm}";
    }

    /// <summary>
    /// Busca a cor no dicionário do tema em tempo de execução. Se a chave não
    /// existir (tema trocado), cai num cinza neutro em vez de estourar no load.
    /// </summary>
    private static Brush LookupBrush(string key, Color fallback) =>
        Application.Current?.TryFindResource(key) as Brush ?? new SolidColorBrush(fallback);
}
