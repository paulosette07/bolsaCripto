using System.Net.Http;
using System.Windows;

using BolsaMonitor.Core.Alerts;
using BolsaMonitor.Core.Api;
using BolsaMonitor.Core.Data;
using BolsaMonitor.Core.Email;
using BolsaMonitor.Core.Market;
using BolsaMonitor.Core.News;
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
///
/// Há **três** montagens possíveis, escolhidas aqui e em nenhum outro lugar:
///
///  - `--demo`: dados fictícios, sem rede e sem Supabase;
///  - **hospedado** (padrão da release): `ApiBaseUrl` preenchido, dados vindos
///    do servidor do Bolsa Monitor com o token do usuário;
///  - **direto**: `ApiBaseUrl` vazio, o app fala com Brapi/CoinGecko/Yahoo/BCB
///    e envia e-mail com as credenciais do próprio `appsettings.json`.
///
/// A regra que mantém os três honestos: nada acima desta classe sabe de onde o
/// número veio. As ViewModels recebem `IMarketService`/`IMacroService`/
/// `INewsService`/`IUsdRateService`/`IAlertRunner` e pronto.
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
    /// Ordem de precedência, do mais fraco ao mais forte:
    ///
    ///  1. `appsettings.defaults.json` — versionado, só dados públicos; é o que
    ///     faz a release abrir já em modo hospedado, sem arquivo de configuração;
    ///  2. `appsettings.json` — opcional, do usuário; sobrescreve os defaults
    ///     (é aqui que entra um BrapiToken ou um ApiBaseUrl próprio);
    ///  3. variáveis de ambiente com prefixo `BOLSAMONITOR_` — para CI.
    /// </summary>
    private static AppOptions LoadOptions()
    {
        var configuration = new ConfigurationBuilder()
            .SetBasePath(AppContext.BaseDirectory)
            .AddJsonFile("appsettings.defaults.json", optional: true, reloadOnChange: false)
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
        services.AddSingleton<RateTickerViewModel>();

        if (isDemo)
        {
            RegisterDemoData(services);
        }
        else if (options.UseHostedApi)
        {
            RegisterHostedData(services);
        }
        else
        {
            RegisterDirectData(services);
        }

        services.AddTransient<LoginViewModel>();
        services.AddTransient<DashboardViewModel>();
        services.AddTransient<MarketViewModel>();
        services.AddTransient<PortfolioViewModel>();
        services.AddTransient<AlertsViewModel>();
        services.AddTransient<ShellViewModel>();

        return services.BuildServiceProvider();
    }

    /// <summary>Cotações fictícias, sem rede nem Supabase.</summary>
    private static void RegisterDemoData(IServiceCollection services)
    {
        services.AddSingleton<IUsdRateService, DemoUsdRateService>();
        services.AddSingleton<IMarketService, DemoMarketService>();
        services.AddSingleton<IMacroService, DemoMacroService>();
        services.AddSingleton<INewsService, DemoNewsService>();
        services.AddSingleton<IPortfolioRepository, DemoPortfolioRepository>();
        services.AddSingleton<IFavoriteRepository, DemoFavoriteRepository>();
        services.AddSingleton<IAlertRepository, DemoAlertRepository>();

        // No demo o monitor roda em memória; nada sai por e-mail.
        services.AddSingleton<AlertMonitor>();
        services.AddSingleton<IAlertRunner>(provider => provider.GetRequiredService<AlertMonitor>());
    }

    /// <summary>
    /// Release: os dados vêm do servidor do Bolsa Monitor, autenticados com o
    /// token do próprio usuário. Nenhuma chave de provider mora no cliente — nem
    /// a de e-mail, porque quem envia é o servidor.
    /// </summary>
    private static void RegisterHostedData(IServiceCollection services)
    {
        services.AddSingleton<ApiClient>(provider => new ApiClient(
            new HttpClient(),
            provider.GetRequiredService<SupabaseGateway>(),
            provider.GetRequiredService<AppOptions>()));

        services.AddSingleton<IUsdRateService, ApiUsdRateService>();
        services.AddSingleton<IMarketService, ApiMarketService>();
        services.AddSingleton<IMacroService, ApiMacroService>();
        services.AddSingleton<INewsService, ApiNewsService>();
        services.AddSingleton<IAlertRunner, ApiAlertRunner>();

        // Carteira, favoritos e alertas continuam indo direto ao Supabase com o
        // token do usuário: são dados dele, protegidos por RLS, e não passam por
        // um servidor intermediário.
        services.AddSingleton<IPortfolioRepository, PortfolioRepository>();
        services.AddSingleton<IFavoriteRepository, FavoriteRepository>();
        services.AddSingleton<IAlertRepository, AlertRepository>();
    }

    /// <summary>
    /// Código-fonte: o app consulta Brapi, CoinGecko, Yahoo e o BCB direto, e
    /// envia e-mail com as credenciais do `appsettings.json`.
    /// </summary>
    private static void RegisterDirectData(IServiceCollection services)
    {
        services.AddSingleton(new JsonHttpClient(new HttpClient()));

        // Câmbio USD/BRL: a cripto é consultada sempre em reais e o dólar é
        // derivado desta taxa (uma URL por moeda só, sem 429 ao alternar).
        services.AddSingleton(_ => new UsdBrlRateProvider(new HttpClient()));
        services.AddSingleton(_ => new UsdRateService(new HttpClient()));
        services.AddSingleton<IUsdRateService>(provider => provider.GetRequiredService<UsdRateService>());

        services.AddSingleton<BrapiClient>();
        services.AddSingleton<CoinGeckoClient>();
        services.AddSingleton<IMarketService, MarketService>();
        services.AddSingleton<IPortfolioRepository, PortfolioRepository>();
        services.AddSingleton<IFavoriteRepository, FavoriteRepository>();
        services.AddSingleton<IAlertRepository, AlertRepository>();

        // Yahoo atende índice/câmbio/commodity e é a reserva do câmbio; tem
        // HttpClient próprio porque o host muda em caso de rate limit.
        services.AddSingleton(_ => new YahooClient(new HttpClient()));
        services.AddSingleton<IMacroService>(provider => new MacroClient(
            new HttpClient(),
            provider.GetRequiredService<YahooClient>()));
        services.AddSingleton<INewsService>(_ => new NewsService(new HttpClient()));

        // Modo direto: o monitor cota, avalia e envia o e-mail aqui mesmo.
        services.AddSingleton<AlertMonitor>();
        services.AddSingleton<IAlertRunner>(provider => provider.GetRequiredService<AlertMonitor>());
    }
}
