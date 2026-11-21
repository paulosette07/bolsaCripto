using System.Windows;
using System.Windows.Threading;

using BolsaMonitor.Desktop.Interop;
using BolsaMonitor.Desktop.ViewModels;

namespace BolsaMonitor.Desktop;

/// <summary>
/// Moldura do app logado.
///
/// O timer de alertas vive aqui (e não na ViewModel) porque depende do
/// `DispatcherTimer` do WPF: assim a ViewModel continua testável e sem
/// dependência de UI.
/// </summary>
public partial class MainWindow : Window
{
    private readonly ShellViewModel _viewModel;
    private readonly DispatcherTimer _alertTimer;

    public MainWindow(ShellViewModel viewModel)
    {
        _viewModel = viewModel;
        DataContext = viewModel;

        InitializeComponent();

        DarkTitleBar.Apply(this);

        _alertTimer = new DispatcherTimer
        {
            Interval = TimeSpan.FromMinutes(5)
        };

        _alertTimer.Tick += OnAlertTimerTick;

        _viewModel.SignedOut += OnSignedOut;
        Loaded += OnLoaded;
        Closed += OnClosed;
    }

    /// <summary>Verdadeiro quando a janela fechou por logout (o app volta ao login).</summary>
    public bool SignedOut { get; private set; }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        try
        {
            await _viewModel.InitializeAsync();

            _alertTimer.Start();

            // Primeira verificação logo após abrir: um alerta pode ter disparado
            // enquanto o app estava fechado.
            await _viewModel.CheckAlertsAsync();
        }
        catch (Exception exception)
        {
            MessageBox.Show(
                this,
                $"Não foi possível carregar os dados: {exception.Message}",
                "Bolsa Monitor",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
        }
    }

    private async void OnAlertTimerTick(object? sender, EventArgs e)
    {
        await _viewModel.CheckAlertsAsync();
    }

    private void OnSignedOut(object? sender, EventArgs e)
    {
        SignedOut = true;
        Close();
    }

    private void OnClosed(object? sender, EventArgs e)
    {
        _alertTimer.Stop();
        _alertTimer.Tick -= OnAlertTimerTick;
        _viewModel.SignedOut -= OnSignedOut;
    }
}
