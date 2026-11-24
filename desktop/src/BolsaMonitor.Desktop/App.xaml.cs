using System.IO;
using System.Net.Http;
using System.Windows;

using BolsaMonitor.Core.Alerts;
using BolsaMonitor.Core.Data;
using BolsaMonitor.Core.Email;
using BolsaMonitor.Core.Market;
using BolsaMonitor.Core.Options;
using BolsaMonitor.Core.Persistence;
using BolsaMonitor.Desktop.Demo;
using BolsaMonitor.Desktop.ViewModels;
using BolsaMonitor.Desktop.Views;

using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace BolsaMonitor.Desktop;

/// <summary>
/// Composition root do app.
///
/// Não usamos `StartupUri`: o fluxo de abertura depende da sessão salva — se o
/// token ainda vale, entra direto na shell; senão, mostra o login.
/// </summary>
public partial class App : Application
{
    private const string DemoSwitch = "--demo";

    private ServiceProvider? _services;

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        try
        {
            var options = LoadOptions();
            var isDemo = e.Args.Any(argument =>
                string.Equals(argument, DemoSwitch, StringComparison.OrdinalIgnoreCase));

            _services = BuildServices(options, isDemo);

            if (isDemo)
            {
                // Modo demonstração: identidade fictícia e dados em memória, sem
                // rede. Serve para inspecionar as telas e para testes manuais.
                _services.GetRequiredService<SupabaseGateway>()
                    .UseDemoIdentity("11111111-1111-1111-1111-111111111111", "demo@bolsamonitor.app", "Ana Ribeiro");

                ShowShell();

                return;
            }

            var login = _services.GetRequiredService<LoginViewModel>();

            if (await login.TryRestoreAsync())
            {
                ShowShell();

                return;
            }

            ShowLogin();
        }
        catch (Exception exception)
        {
            MessageBox.Show(
                $"Não foi possível iniciar o Bolsa Monitor.\n\n{exception.Message}",
                "Bolsa Monitor",
                MessageBoxButton.OK,
                MessageBoxImage.Error);

            Shutdown(1);
        }
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _services?.Dispose();

        base.OnExit(e);
    }

    private void ShowLogin()
    {
        var viewModel = _services!.GetRequiredService<LoginViewModel>();
        var window = new LoginWindow(viewModel);

        var authenticated = window.ShowDialog() == true && window.Authenticated;

        if (!authenticated)
        {
            Shutdown();

            return;
        }

        ShowShell();
    }

    private void ShowShell()
    {
        var viewModel = _services!.GetRequiredService<ShellViewModel>();
        var window = new MainWindow(viewModel);

        MainWindow = window;

        // Logout volta ao login; fechar a janela encerra o app.
        window.Closed += (_, _) =>
        {
            if (window.SignedOut)
            {
                ShowLogin();
            }
            else
            {
                Shutdown();
            }
        };

        window.Show();
    }

    /// <summary>
    /// Lê `appsettings.json` ao lado do executável. Variáveis de ambiente
    /// sobrescrevem o arquivo — útil para CI e para não versionar segredo.
    /// </summary>
    private static AppOptions LoadOptions()
    {
        var configuration = new ConfigurationBuilder()
            .SetBasePath(AppContext.BaseDirectory)
            .AddJsonFile("appsettings.json", optional: true, reloadOnChange: false)
            .AddEnvironmentVariables("BOLSAMONITOR_")
            .Build();

        var options = new AppOptions();
        configuration.Bind(options);

        return options;
    }

    private static ServiceProvider BuildServices(AppOptions options, bool isDemo)
    {
        var services = new ServiceCollection();

        services.AddSingleton(options);
        services.AddSingleton<SessionStore>();
        services.AddSingleton<SupabaseGateway>();
        services.AddSingleton<EmailDispatcher>();
        services.AddSingleton<AlertMonitor>();

        if (isDemo)
        {
            services.AddSingleton<IMarketService, DemoMarketService>();
            services.AddSingleton<IPortfolioRepository, DemoPortfolioRepository>();
            services.AddSingleton<IFavoriteRepository, DemoFavoriteRepository>();
            services.AddSingleton<IAlertRepository, DemoAlertRepository>();
        }
        else
        {
            services.AddSingleton(new JsonHttpClient(new HttpClient()));
            services.AddSingleton<BrapiClient>();
            services.AddSingleton<CoinGeckoClient>();
            services.AddSingleton<IMarketService, MarketService>();
            services.AddSingleton<IPortfolioRepository, PortfolioRepository>();
            services.AddSingleton<IFavoriteRepository, FavoriteRepository>();
            services.AddSingleton<IAlertRepository, AlertRepository>();
        }

        services.AddTransient<LoginViewModel>();
        services.AddTransient<DashboardViewModel>();
        services.AddTransient<MarketViewModel>();
        services.AddTransient<PortfolioViewModel>();
        services.AddTransient<AlertsViewModel>();
        services.AddTransient<ShellViewModel>();

        return services.BuildServiceProvider();
    }
}
