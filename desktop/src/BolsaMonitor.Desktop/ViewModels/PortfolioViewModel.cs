using System.Collections.ObjectModel;
using System.Globalization;
using System.Windows;

using BolsaMonitor.Core.Data;
using BolsaMonitor.Core.Formatting;
using BolsaMonitor.Core.Market;
using BolsaMonitor.Core.Models;
using BolsaMonitor.Core.Portfolio;

using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace BolsaMonitor.Desktop.ViewModels;

/// <summary>
/// Carteira: resumo, tabela de posições e formulário de cadastro.
///
/// Cadastrar um ativo já existente soma a quantidade e recalcula o preço médio
/// ponderado — o comportamento de uma compra adicional, não de um duplicado.
/// </summary>
public sealed partial class PortfolioViewModel : PageViewModel
{
    private readonly IPortfolioRepository _portfolio;
    private readonly IMarketService _market;

    public PortfolioViewModel(IPortfolioRepository portfolio, IMarketService market)
    {
        _portfolio = portfolio;
        _market = market;
        _selectedAssetType = AssetTypeOptions[0];
    }

    public override string Title => "Carteira";

    public override string Subtitle => "Quantidade exata de cotas e frações, com valor de mercado atualizado.";

    public ObservableCollection<PositionView> Positions { get; } = new();

    public ObservableCollection<AssetTypeOption> AssetTypeOptions { get; } = new()
    {
        new AssetTypeOption(AssetType.Stock, "Bolsa (ação / FII)", "PETR4"),
        new AssetTypeOption(AssetType.Crypto, "Criptomoeda", "BTC")
    };

    [ObservableProperty]
    private string _totalValueText = BrlFormat.Currency(0m);

    [ObservableProperty]
    private string _totalCostText = BrlFormat.Currency(0m);

    [ObservableProperty]
    private string _profitText = BrlFormat.SignedCurrency(0m);

    [ObservableProperty]
    private decimal? _profitPercent;

    [ObservableProperty]
    private string _allocationText = "0,00% / 0,00%";

    [ObservableProperty]
    private GridLength _stockBarWidth = new(1, GridUnitType.Star);

    [ObservableProperty]
    private GridLength _cryptoBarWidth = new(1, GridUnitType.Star);

    [ObservableProperty]
    private double _stockShare;

    [ObservableProperty]
    private double _cryptoShare;

    [ObservableProperty]
    private int _missingQuotesCount;

    // ---- formulário ----

    [ObservableProperty]
    private string _newTicker = string.Empty;

    [ObservableProperty]
    private AssetTypeOption _selectedAssetType;

    [ObservableProperty]
    private string _newQuantity = string.Empty;

    [ObservableProperty]
    private string _newAvgPrice = string.Empty;

    [ObservableProperty]
    private string _newNotes = string.Empty;

    [ObservableProperty]
    private string? _formMessage;

    [ObservableProperty]
    private bool _formSucceeded;

    public bool HasPositions => Positions.Count > 0;

    public string QuantityHint => SelectedAssetType.Type == AssetType.Crypto
        ? "Aceita frações: 0,035"
        : "Número de cotas: 100";


    partial void OnSelectedAssetTypeChanged(AssetTypeOption value) => OnPropertyChanged(nameof(QuantityHint));

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

            Positions.Clear();

            foreach (var position in positions)
            {
                Positions.Add(position);
            }

            OnPropertyChanged(nameof(HasPositions));

            TotalValueText = BrlFormat.Currency(summary.TotalValue);
            TotalCostText = BrlFormat.Currency(summary.TotalCost);
            ProfitText = BrlFormat.SignedCurrency(summary.TotalProfit);
            ProfitPercent = summary.TotalProfitPercent;
            MissingQuotesCount = summary.MissingQuotesCount;

            StockShare = summary.TotalValue > 0m ? (double)(summary.StockValue / summary.TotalValue) * 100d : 0d;
            CryptoShare = summary.TotalValue > 0m ? (double)(summary.CryptoValue / summary.TotalValue) * 100d : 0d;

            // A barra usa colunas em estrela: proporção exata, inclusive com 0%.
            StockBarWidth = new GridLength(Math.Max(StockShare, 0d), GridUnitType.Star);
            CryptoBarWidth = new GridLength(Math.Max(CryptoShare, 0d), GridUnitType.Star);

            AllocationText = $"{BrlFormat.PercentPlain((decimal)StockShare)} / {BrlFormat.PercentPlain((decimal)CryptoShare)}";
        });

    [RelayCommand]
    private Task RefreshAsync() => LoadAsync();

    [RelayCommand]
    private async Task AddPositionAsync()
    {
        FormMessage = null;
        FormSucceeded = false;

        var ticker = NewTicker.Trim().ToUpperInvariant();

        if (ticker.Length == 0)
        {
            FormMessage = "Informe o código do ativo (ex: PETR4, BTC).";

            return;
        }

        if (!BrlFormat.TryParseDecimal(NewQuantity, out var quantity) || quantity <= 0m)
        {
            FormMessage = "A quantidade precisa ser um número maior que zero.";

            return;
        }

        decimal? avgPrice = null;

        if (!string.IsNullOrWhiteSpace(NewAvgPrice))
        {
            if (!BrlFormat.TryParseDecimal(NewAvgPrice, out var parsedPrice) || parsedPrice < 0m)
            {
                FormMessage = "Preço médio inválido.";

                return;
            }

            avgPrice = parsedPrice;
        }

        await RunGuardedAsync(async () =>
        {
            var assetType = SelectedAssetType.Type;
            var asset = await _market.ResolveAssetAsync(new AssetRef(ticker, assetType, null), CancellationToken.None)
                .ConfigureAwait(true);

            var quote = await _market.GetSingleQuoteAsync(asset, CancellationToken.None).ConfigureAwait(true);

            if (quote is null)
            {
                FormMessage = $"Não encontramos \"{ticker}\" {(assetType == AssetType.Crypto ? "entre as criptomoedas" : "na B3")}.";

                return;
            }

            if (assetType == AssetType.Crypto && string.IsNullOrWhiteSpace(asset.CryptoId))
            {
                FormMessage = "Não foi possível identificar essa criptomoeda. Verifique o código.";

                return;
            }

            var existing = await _portfolio
                .FindAsync(asset.Ticker, assetType, CancellationToken.None)
                .ConfigureAwait(true);

            if (existing is null)
            {
                await _portfolio
                    .InsertAsync(asset.Ticker, assetType, asset.CryptoId, quantity, avgPrice, NewNotes, CancellationToken.None)
                    .ConfigureAwait(true);

                FormMessage = $"{asset.Ticker} adicionado à carteira.";
            }
            else
            {
                var (mergedQuantity, mergedAvgPrice) = PortfolioCalculator.Merge(
                    existing.Quantity,
                    existing.AvgPrice,
                    quantity,
                    avgPrice);

                await _portfolio
                    .UpdateAsync(existing.Id, mergedQuantity, mergedAvgPrice, CancellationToken.None)
                    .ConfigureAwait(true);

                FormMessage =
                    $"Posição atualizada: agora você tem {BrlFormat.Quantity(mergedQuantity)} de {asset.Ticker}.";
            }

            FormSucceeded = true;
            NewTicker = string.Empty;
            NewQuantity = string.Empty;
            NewAvgPrice = string.Empty;
            NewNotes = string.Empty;

            await LoadAsync().ConfigureAwait(true);
        }).ConfigureAwait(true);
    }

    [RelayCommand]
    private async Task DeletePositionAsync(PositionView? position)
    {
        if (position is null)
        {
            return;
        }

        await RunGuardedAsync(async () =>
        {
            await _portfolio.DeleteAsync(position.Id, CancellationToken.None).ConfigureAwait(true);
            await LoadAsync().ConfigureAwait(true);
        }).ConfigureAwait(true);
    }

    [RelayCommand]
    private void ClearForm()
    {
        NewTicker = string.Empty;
        NewQuantity = string.Empty;
        NewAvgPrice = string.Empty;
        NewNotes = string.Empty;
        FormMessage = null;
        FormSucceeded = false;
    }

    /// <summary>Formata a quantidade digitada sem alterar o valor (apenas exibição).</summary>
    public static string FormatQuantity(decimal value) =>
        value.ToString("0.########", CultureInfo.GetCultureInfo("pt-BR"));
}

/// <summary>Item do seletor de tipo de ativo.</summary>
public sealed record AssetTypeOption(AssetType Type, string Label, string Placeholder)
{
    // O ComboBox desenha o item pelo ToString quando não há ItemTemplate.
    public override string ToString() => Label;
}
