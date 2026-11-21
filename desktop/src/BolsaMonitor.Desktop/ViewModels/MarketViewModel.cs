using System.Collections.ObjectModel;

using BolsaMonitor.Core.Formatting;
using BolsaMonitor.Core.Market;
using BolsaMonitor.Core.Models;
using BolsaMonitor.Desktop.Charts;

using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

using LiveChartsCore;
using LiveChartsCore.SkiaSharpView;

namespace BolsaMonitor.Desktop.ViewModels;

/// <summary>Opção do seletor de período.</summary>
public sealed partial class RangeOption : ObservableObject
{
    public RangeOption(MarketRange range, string label)
    {
        Range = range;
        Label = label;
    }

    public MarketRange Range { get; }

    public string Label { get; }

    [ObservableProperty]
    private bool _isSelected;
}

/// <summary>Opção do seletor de moeda (real ↔ dólar).</summary>
public sealed partial class CurrencyOption : ObservableObject
{
    public CurrencyOption(DisplayCurrency currency)
    {
        Currency = currency;
    }

    public DisplayCurrency Currency { get; }

    public string Label => Currency.ToDisplayLabel();

    public string Symbol => Currency.ToSymbol();

    [ObservableProperty]
    private bool _isSelected;
}

/// <summary>
/// Mercado: busca de ativos, cotação atual e gráfico histórico.
///
/// A busca consulta B3 e cripto em paralelo, mas só quando há 2+ caracteres —
/// evita gastar rate limit com cada tecla digitada.
/// </summary>
public sealed partial class MarketViewModel : PageViewModel
{
    private const int DebounceMilliseconds = 320;

    private readonly IMarketService _market;
    private CancellationTokenSource? _searchCts;

    public MarketViewModel(IMarketService market)
    {
        _market = market;

        Ranges = new ObservableCollection<RangeOption>(
            Enum.GetValues<MarketRange>().Select(range => new RangeOption(range, range.ToLabel())));

        Currencies = new ObservableCollection<CurrencyOption>(
            Enum.GetValues<DisplayCurrency>().Select(currency => new CurrencyOption(currency)));

        SelectRange(MarketRange.OneMonth);
        SelectCurrency(DisplayCurrency.Brl);
    }

    public override string Title => "Mercado";

    public override string Subtitle =>
        "Cotações da B3 em reais e criptomoedas em real ou dólar, com histórico interativo.";

    public ObservableCollection<AssetSearchResult> Suggestions { get; } = new();

    public ObservableCollection<RangeOption> Ranges { get; }

    public ObservableCollection<CurrencyOption> Currencies { get; }

    [ObservableProperty]
    private string _searchText = string.Empty;

    [ObservableProperty]
    private bool _isSearching;

    [ObservableProperty]
    private AssetSearchResult? _selectedAsset;

    [ObservableProperty]
    private string _ticker = "PETR4";

    [ObservableProperty]
    private string _assetName = "Petrobras PN";

    [ObservableProperty]
    private string _assetKind = "Bolsa";

    [ObservableProperty]
    private string _priceText = BrlFormat.Price(0m);

    [ObservableProperty]
    private decimal _changePercent;

    [ObservableProperty]
    private string _changeValueText = BrlFormat.SignedCurrency(0m);

    [ObservableProperty]
    private string _updatedAtText = string.Empty;

    [ObservableProperty]
    private ISeries[] _chartSeries = Array.Empty<ISeries>();

    [ObservableProperty]
    private Axis[] _chartXAxes = Array.Empty<Axis>();

    [ObservableProperty]
    private Axis[] _chartYAxes = Array.Empty<Axis>();

    [ObservableProperty]
    private MarketRange _selectedRange = MarketRange.OneMonth;

    [ObservableProperty]
    private DisplayCurrency _selectedCurrency = DisplayCurrency.Brl;

    /// <summary>O seletor de moeda só aparece para cripto: a B3 negocia em reais.</summary>
    [ObservableProperty]
    private bool _canSwitchCurrency;

    public bool HasSuggestions => Suggestions.Count > 0;

    /// <summary>Controla a dica de texto dentro do campo de busca.</summary>
    public bool SearchIsEmpty => string.IsNullOrWhiteSpace(SearchText);

    /// <summary>Chamado pelo code-behind a cada alteração do campo de busca.</summary>
    partial void OnSearchTextChanged(string value)
    {
        OnPropertyChanged(nameof(SearchIsEmpty));

        _searchCts?.Cancel();
        _searchCts = new CancellationTokenSource();
        var token = _searchCts.Token;

        _ = SearchDebouncedAsync(value, token);
    }

    public override Task LoadAsync(CancellationToken cancellationToken = default) =>
        RunGuardedAsync(async () =>
        {
            var asset = SelectedAsset is null
                ? new AssetRef(Ticker, AssetType.Stock, null)
                : new AssetRef(SelectedAsset.Ticker, SelectedAsset.AssetType, SelectedAsset.CryptoId);

            await LoadAssetAsync(asset, SelectedRange, cancellationToken).ConfigureAwait(true);
        });

    [RelayCommand]
    private async Task SearchAsync()
    {
        if (SearchText.Trim().Length < 2)
        {
            return;
        }

        await RunGuardedAsync(async () =>
        {
            var results = await _market.SearchAsync(SearchText, CancellationToken.None).ConfigureAwait(true);

            Suggestions.Clear();

            foreach (var result in results)
            {
                Suggestions.Add(result);
            }

            OnPropertyChanged(nameof(HasSuggestions));
            ErrorMessage = Suggestions.Count == 0 ? "Nenhum ativo encontrado para essa busca." : null;
        }).ConfigureAwait(true);
    }

    [RelayCommand]
    private async Task SelectAssetAsync(AssetSearchResult? result)
    {
        if (result is null)
        {
            return;
        }

        SelectedAsset = result;
        Suggestions.Clear();
        OnPropertyChanged(nameof(HasSuggestions));
        SearchText = $"{result.Ticker} · {result.Name}";

        await RunGuardedAsync(() => LoadAssetAsync(
            new AssetRef(result.Ticker, result.AssetType, result.CryptoId),
            SelectedRange,
            CancellationToken.None)).ConfigureAwait(true);
    }

    [RelayCommand]
    private async Task SelectRangeAsync(RangeOption? option)
    {
        if (option is null)
        {
            return;
        }

        SelectRange(option.Range);

        var asset = SelectedAsset is null
            ? new AssetRef(Ticker, AssetType.Stock, null)
            : new AssetRef(SelectedAsset.Ticker, SelectedAsset.AssetType, SelectedAsset.CryptoId);

        await RunGuardedAsync(() => LoadAssetAsync(asset, option.Range, CancellationToken.None)).ConfigureAwait(true);
    }

    [RelayCommand]
    private Task RefreshAsync() => LoadAsync();

    private async Task SearchDebouncedAsync(string query, CancellationToken cancellationToken)
    {
        if (query.Trim().Length < 2)
        {
            return;
        }

        try
        {
            await Task.Delay(DebounceMilliseconds, cancellationToken).ConfigureAwait(true);
            IsSearching = true;

            var results = await _market.SearchAsync(query, cancellationToken).ConfigureAwait(true);

            cancellationToken.ThrowIfCancellationRequested();

            Suggestions.Clear();

            foreach (var result in results)
            {
                Suggestions.Add(result);
            }

            OnPropertyChanged(nameof(HasSuggestions));
        }
        catch (OperationCanceledException)
        {
            // Usuário continuou digitando: a próxima consulta substitui esta.
        }
        catch (Exception exception)
        {
            ErrorMessage = exception.Message;
        }
        finally
        {
            IsSearching = false;
        }
    }

    private async Task LoadAssetAsync(AssetRef asset, MarketRange range, CancellationToken cancellationToken)
    {
        // Bolsa ignora a escolha de moeda: reais são a única cotação real da B3.
        var currency = DisplayCurrencyExtensions.ForAsset(asset.AssetType, SelectedCurrency);
        CanSwitchCurrency = asset.AssetType == AssetType.Crypto;
        SelectCurrency(currency);

        var resolved = await _market.ResolveAssetAsync(asset, cancellationToken).ConfigureAwait(true);
        var quote = await _market
            .GetSingleQuoteAsync(resolved, currency, cancellationToken)
            .ConfigureAwait(true);

        if (quote is null)
        {
            throw new MarketDataException($"Não encontramos cotação para \"{asset.Ticker}\".");
        }

        Ticker = quote.Ticker;
        AssetName = quote.Name;
        AssetKind = quote.AssetType == AssetType.Crypto ? "Cripto · CoinGecko" : "Bolsa · Brapi";
        PriceText = BrlFormat.Price(quote.Price, currency);
        ChangePercent = quote.ChangePercent;
        ChangeValueText = BrlFormat.SignedCurrency(quote.ChangeValue, currency);
        UpdatedAtText = $"Atualizado {BrlFormat.RelativeTime(quote.UpdatedAt)}";

        var history = await _market
            .GetHistoryAsync(resolved, range, currency, cancellationToken)
            .ConfigureAwait(true);

        ApplyChart(history.Points, quote.ChangePercent);
    }

    [RelayCommand]
    private async Task SelectCurrencyAsync(CurrencyOption? option)
    {
        if (option is null || !CanSwitchCurrency || option.Currency == SelectedCurrency)
        {
            return;
        }

        SelectCurrency(option.Currency);

        var asset = SelectedAsset is null
            ? new AssetRef(Ticker, AssetType.Stock, null)
            : new AssetRef(SelectedAsset.Ticker, SelectedAsset.AssetType, SelectedAsset.CryptoId);

        await RunGuardedAsync(() => LoadAssetAsync(asset, SelectedRange, CancellationToken.None))
            .ConfigureAwait(true);
    }

    private void SelectCurrency(DisplayCurrency currency)
    {
        SelectedCurrency = currency;

        foreach (var option in Currencies)
        {
            option.IsSelected = option.Currency == currency;
        }
    }

    private void ApplyChart(IReadOnlyList<HistoryPoint> points, decimal changePercent)
    {
        ChartSeries = PriceChartFactory.BuildSeries(points, changePercent);
        ChartXAxes = PriceChartFactory.BuildXAxes(points);
        var (min, max) = PriceChartFactory.ComputeRange(points);
        ChartYAxes = PriceChartFactory.BuildYAxes(min, max);
    }

    private void SelectRange(MarketRange range)
    {
        SelectedRange = range;

        foreach (var option in Ranges)
        {
            option.IsSelected = option.Range == range;
        }
    }
}
