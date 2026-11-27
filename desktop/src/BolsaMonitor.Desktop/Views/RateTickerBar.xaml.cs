using System.Windows.Controls;

namespace BolsaMonitor.Desktop.Views;

/// <summary>
/// Faixa do dólar comercial. O markup está em `RateTickerBar.xaml`; o
/// code-behind existe só para o XAML compilar (nenhum evento aqui).
///
/// O `DataContext` vem de quem hospeda (`ShellViewModel.RateTicker` ou
/// `LoginViewModel.RateTicker`), não do construtor — assim o mesmo controle
/// serve às duas janelas.
/// </summary>
public partial class RateTickerBar : UserControl
{
    public RateTickerBar()
    {
        InitializeComponent();
    }
}
