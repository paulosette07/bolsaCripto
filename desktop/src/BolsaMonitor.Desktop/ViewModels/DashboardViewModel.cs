using System.Collections.ObjectModel;

using BolsaMonitor.Core.Data;
using BolsaMonitor.Core.Formatting;
using BolsaMonitor.Core.Market;
using BolsaMonitor.Core.Models;
using BolsaMonitor.Core.Portfolio;
using BolsaMonitor.Desktop.Charts;

using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

using LiveChartsCore;
using LiveChartsCore.SkiaSharpView;

namespace BolsaMonitor.Desktop.ViewModels;

/// <summary>
/// Painel inicial: patrimônio, resultado, gráfico do maior ativo e atalhos.
///
/// A "posição em destaque" é a de maior valor de mercado — é o ativo que o
/// usuário provavelmente quer ver primeiro. Sem carteira, cai para PETR4 para
/// que o gráfico nunca apareça vazio.
/// </summary>
public sealed partial class DashboardViewModel : PageViewModel
{
    private static readonly AssetRef FallbackAsset = new("PETR4", AssetType.Stock, null);

    private static readonly AssetRef[] Watchlist =
    {
        new("PETR4", AssetType.Stock, null),
        new("VALE3", AssetType.Stock, null),
        new("ITUB4", AssetType.Stock, null),
        new("HGLG11", AssetType.Stock, null),
        new("BTC", AssetType.Crypto, "bitcoin"),
        new("ETH", AssetType.Crypto, "ethereum")
    };

    private readonly IPortfolioRepository _portfolio;
    private readonly IAlertRepository _alerts;
    private readonly IMarketService _market;

    public DashboardViewModel(IPortfolioRepository portfolio, IAlertRepository alerts, IMarketService market)
    {
        _portfolio = portfolio;
        _alerts = alerts;
        _market = market;
    }

    public override string Title => "Painel";

    public override string Subtitle => "Visão consolidada da sua carteira e do mercado.";

    public ObservableCollection<PositionView> TopPositions { get; } = new();

    public ObservableCollection<WatchlistItem> WatchlistItems { get; } = new();

    [ObservableProperty]
    private string _totalValueText = BrlFormat.Currency(0m);

    [ObservableProperty]
    private string _dayChangeText = BrlFormat.SignedCurrency(0m);

    [ObservableProperty]
    private decimal _dayChangePercent;

    [ObservableProperty]
    private string _profitText = BrlFormat.SignedCurrency(0m);

    [ObservableProperty]
    private decimal? _profitPercent;

    [ObservableProperty]
    private int _positionsCount;

    [ObservableProperty]
    private int _activeAlertsCount;

    [ObservableProperty]
    private int _missingQuotesCount;

    [ObservableProperty]
    private string _featuredTicker = FallbackAsset.Ticker;

    [ObservableProperty]
    private string _featuredName = "Petrobras PN";

    [ObservableProperty]
    private string _featuredPriceText = BrlFormat.Price(0m);

    [ObservableProperty]
    private decimal _featuredChangePercent;

    [ObservableProperty]
    private string _featuredRange = "1 mês";

    [ObservableProperty]
    private ISeries[] _chartSeries = Array.Empty<ISeries>();

    [ObservableProperty]
    private Axis[] _chartXAxes = Array.Empty<Axis>();

    [ObservableProperty]
    private Axis[] _chartYAxes = Array.Empty<Axis>();

    public bool HasPositions => TopPositions.Count > 0;

    public override Task LoadAsync(CancellationToken cancellationToken = default) =>
        RunGuardedAsync(async () =>
        {
            var rows = await _portfolio.ListAsync(cancellationToken).ConfigureAwait(true);
            var quotes = rows.Count > 0
                ? await _market.GetQuoteMapAsync(
                        rows.Select(row => new AssetRef(row.Ticker, AssetTypeExtensions.FromDbValue(row.AssetType), row.CryptoId)),
                        cancellationToken)
                    .ConfigureAwait(true)
                : new Dictionary<string, Quote>();

            var positions = PortfolioCalculator.Build(rows, quotes);
            var summary = PortfolioCalculator.Summarize(positions);

            TotalValueText = BrlFormat.Currency(summary.TotalValue);
            DayChangeText = BrlFormat.SignedCurrency(summary.DayChangeValue);
            DayChangePercent = summary.DayChangePercent;
            ProfitText = BrlFormat.SignedCurrency(summary.TotalProfit);
            ProfitPercent = summary.TotalProfitPercent;
            PositionsCount = summary.PositionsCount;
            MissingQuotesCount = summary.MissingQuotesCount;

            TopPositions.Clear();

            foreach (var position in positions.Take(5))
            {
                TopPositions.Add(position);
            }

            OnPropertyChanged(nameof(HasPositions));

            var alerts = await _alerts.ListAsync(cancellationToken).ConfigureAwait(true);
            ActiveAlertsCount = alerts.Count(alert => alert.IsActive);

            var featured = positions.FirstOrDefault()?.Let(position => new AssetRef(position.Ticker, position.AssetType, position.CryptoId))
                ?? FallbackAsset;

            await LoadFeaturedAsync(featured, cancellationToken).ConfigureAwait(true);
            await LoadWatchlistAsync(cancellationToken).ConfigureAwait(true);
        });

    /// <summary>Recarrega só a cotação do ativo em destaque (botão Atualizar).</summary>
    [RelayCommand]
    private Task RefreshAsync() => LoadAsync();

    private async Task LoadFeaturedAsync(AssetRef asset, CancellationToken cancellationToken)
    {
        FeaturedTicker = asset.Ticker;
        FeaturedRange = "1 mês";

        var resolved = await _market.ResolveAssetAsync(asset, cancellationToken).ConfigureAwait(true);
        var quote = await _market.GetSingleQuoteAsync(resolved, cancellationToken).ConfigureAwait(true);

        if (quote is not null)
        {
            FeaturedName = quote.Name;
            FeaturedPriceText = BrlFormat.Price(quote.Price);
            FeaturedChangePercent = quote.ChangePercent;
        }

        var history = await _market.GetHistoryAsync(resolved, MarketRange.OneMonth, cancellationToken).ConfigureAwait(true);
        ApplyChart(history.Points, quote?.ChangePercent ?? 0m);
    }

    private async Task LoadWatchlistAsync(CancellationToken cancellationToken)
    {
        var quotes = await _market.GetQuoteMapAsync(Watchlist, cancellationToken).ConfigureAwait(true);

        WatchlistItems.Clear();

        foreach (var asset in Watchlist)
        {
            if (quotes.TryGetValue(asset.Key, out var quote))
            {
                WatchlistItems.Add(new WatchlistItem(asset.Ticker, quote.Name, quote.Price, quote.ChangePercent, quote.AssetType));
            }
        }
    }

    private void ApplyChart(IReadOnlyList<HistoryPoint> points, decimal changePercent)
    {
        ChartSeries = PriceChartFactory.BuildSeries(points, changePercent);
        ChartXAxes = PriceChartFactory.BuildXAxes(points);
        var (min, max) = PriceChartFactory.ComputeRange(points);
        ChartYAxes = PriceChartFactory.BuildYAxes(min, max);
    }
}

/// <summary>Linha da lista de atalhos de mercado.</summary>
public sealed record WatchlistItem(string Ticker, string Name, decimal Price, decimal ChangePercent, AssetType AssetType);

internal static class FunctionalExtensions
{
    /// <summary>`Map` pontual: evita um bloco de três linhas para uma transformação.</summary>
    public static TResult Let<T, TResult>(this T value, Func<T, TResult> projection) => projection(value);
}
