using System.Collections.ObjectModel;

using BolsaMonitor.Core.Alerts;
using BolsaMonitor.Core.Data;
using BolsaMonitor.Core.Options;

using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace BolsaMonitor.Desktop.ViewModels;

/// <summary>Item da navegação lateral, com estado ativo próprio.</summary>
public sealed partial class NavItem : ObservableObject
{
    public NavItem(string key, string label)
    {
        Key = key;
        Label = label;
    }

    public string Key { get; }

    public string Label { get; }

    [ObservableProperty]
    private bool _isActive;
}

/// <summary>
/// Moldura do app logado: navegação entre as quatro telas, dados do usuário,
/// verificação periódica de alertas e saída da conta.
///
/// O timer fica na janela (code-behind) e chama `CheckAlertsAsync` — a ViewModel
/// não conhece o Dispatcher do WPF.
/// </summary>
public sealed partial class ShellViewModel : ObservableObject
{
    private readonly AppOptions _options;
    private readonly SupabaseGateway _gateway;
    private readonly IAlertRunner _monitor;
    private readonly DashboardViewModel _dashboard;
    private readonly MarketViewModel _market;
    private readonly PortfolioViewModel _portfolio;
    private readonly AlertsViewModel _alerts;

    public ShellViewModel(
        AppOptions options,
        SupabaseGateway gateway,
        IAlertRunner monitor,
        RateTickerViewModel rateTicker,
        DashboardViewModel dashboard,
        MarketViewModel market,
        PortfolioViewModel portfolio,
        AlertsViewModel alerts)
    {
        _options = options;
        _gateway = gateway;
        _monitor = monitor;
        RateTicker = rateTicker;
        _dashboard = dashboard;
        _market = market;
        _portfolio = portfolio;
        _alerts = alerts;

        NavItems = new ObservableCollection<NavItem>
        {
            new("dashboard", "Painel"),
            new("market", "Mercado"),
            new("portfolio", "Carteira"),
            new("alerts", "Alertas")
        };

        _currentPage = _dashboard;
        _selectedNavKey = "dashboard";
        NavItems[0].IsActive = true;
    }

    /// <summary>Disparado quando o usuário sai — a janela volta para o login.</summary>
    public event EventHandler? SignedOut;

    public ObservableCollection<NavItem> NavItems { get; }

    /// <summary>Faixa fixa do dólar, exibida no rodapé da shell.</summary>
    public RateTickerViewModel RateTicker { get; }

    [ObservableProperty]
    private PageViewModel _currentPage;

    [ObservableProperty]
    private string _selectedNavKey;

    [ObservableProperty]
    private string _userName = string.Empty;

    [ObservableProperty]
    private string _userInitials = "?";

    [ObservableProperty]
    private string _userEmail = string.Empty;

    [ObservableProperty]
    private string _alertStatus = "Alertas: verificando a cada 5 minutos.";

    [ObservableProperty]
    private bool _isCheckingAlerts;

    [ObservableProperty]
    private string? _toastMessage;

    public string CurrentTitle => CurrentPage.Title;

    public string CurrentSubtitle => CurrentPage.Subtitle;

    public bool IsCurrentPageBusy => CurrentPage.IsBusy;

    /// <summary>Carrega o usuário, avisa sobre e-mail e abre o painel.</summary>
    public async Task InitializeAsync()
    {
        UserEmail = _gateway.Email ?? string.Empty;
        UserName = string.IsNullOrWhiteSpace(_gateway.FullName)
            ? UserEmail.Split('@')[0]
            : _gateway.FullName!;

        UserInitials = BuildInitials(UserName);

        // No modo hospedado quem envia o e-mail é o servidor, então a ausência
        // de Resend/SMTP aqui não é problema — avisar seria ruído.
        _alerts.SetEmailWarning(!_options.UseHostedApi && !_options.IsEmailConfigured
            ? "E-mail não configurado: os alertas não serão enviados até você preencher ResendApiKey ou Smtp no appsettings.json."
            : null);

        await Task.WhenAll(RateTicker.RefreshAsync(), CurrentPage.LoadAsync()).ConfigureAwait(true);
    }

    [RelayCommand]
    private async Task NavigateAsync(string? key)
    {
        if (string.IsNullOrWhiteSpace(key))
        {
            return;
        }

        var next = key switch
        {
            "market" => (PageViewModel)_market,
            "portfolio" => _portfolio,
            "alerts" => _alerts,
            _ => _dashboard
        };

        if (ReferenceEquals(next, CurrentPage))
        {
            await next.LoadAsync().ConfigureAwait(true);

            return;
        }

        SelectedNavKey = key;

        foreach (var item in NavItems)
        {
            item.IsActive = string.Equals(item.Key, key, StringComparison.OrdinalIgnoreCase);
        }

        CurrentPage = next;
        OnPropertyChanged(nameof(CurrentTitle));
        OnPropertyChanged(nameof(CurrentSubtitle));

        await next.LoadAsync().ConfigureAwait(true);
    }

    [RelayCommand]
    private Task RefreshAsync() => CurrentPage.LoadAsync();

    /// <summary>Uma rodada de verificação de alertas (timer da janela ou botão manual).</summary>
    public async Task CheckAlertsAsync(bool announce = false)
    {
        if (IsCheckingAlerts || _gateway.Email is null)
        {
            return;
        }

        IsCheckingAlerts = true;
        AlertStatus = "Verificando alertas…";

        try
        {
            var summary = await _monitor.RunOnceAsync().ConfigureAwait(true);

            AlertStatus = summary switch
            {
                { Failed: > 0 } => $"Falha ao enviar: {summary.LastError}",
                { Sent: > 0 } => $"{summary.Sent} alerta(s) enviado(s) agora.",
                _ => $"Alertas em dia · verificado {DateTimeOffset.Now:HH:mm}"
            };

            if (summary.Sent > 0 || announce)
            {
                ToastMessage = AlertStatus;
            }
        }
        catch (Exception exception)
        {
            AlertStatus = $"Não foi possível verificar alertas: {exception.Message}";
        }
        finally
        {
            IsCheckingAlerts = false;
        }
    }

    [RelayCommand]
    private async Task SignOutAsync()
    {
        await _gateway.SignOutAsync().ConfigureAwait(true);
        SignedOut?.Invoke(this, EventArgs.Empty);
    }

    [RelayCommand]
    private void DismissToast() => ToastMessage = null;

    private static string BuildInitials(string name)
    {
        var parts = name
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(part => part.Length > 0)
            .Take(2)
            .Select(part => char.ToUpperInvariant(part[0]))
            .ToArray();

        return parts.Length == 0 ? "?" : new string(parts);
    }
}
