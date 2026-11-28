using System.Collections.ObjectModel;

using BolsaMonitor.Core.Alerts;
using BolsaMonitor.Core.Data;
using BolsaMonitor.Core.Formatting;
using BolsaMonitor.Core.Market;
using BolsaMonitor.Core.Models;

using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace BolsaMonitor.Desktop.ViewModels;

/// <summary>Alerta com a cotação atual já embutida (a tela mostra a distância até o alvo).</summary>
public sealed record AlertItem(
    Guid Id,
    string Ticker,
    AssetType AssetType,
    string ConditionLabel,
    decimal TargetPrice,
    bool IsActive,
    int CooldownMinutes,
    DateTimeOffset? LastNotifiedAt,
    decimal? CurrentPrice,
    decimal? DistancePercent,
    string TargetText,
    string CurrentText,
    string LastNotifiedText);

/// <summary>Linha do histórico de disparos.</summary>
public sealed record AlertEventItem(
    string Ticker,
    string Description,
    string Status,
    string StatusLabel,
    string CreatedAtText,
    string? Provider);

/// <summary>
/// Alertas: cadastro, lista com preço atual e histórico de disparos.
///
/// A checagem é idempotente (claim no banco), então rodar manualmente aqui não
/// gera risco de e-mail duplicado junto com o cron do servidor.
/// </summary>
public sealed partial class AlertsViewModel : PageViewModel
{
    private const int MaxEvents = 10;

    private readonly IAlertRepository _alerts;
    private readonly IMarketService _market;
    private readonly IAlertRunner _monitor;

    /// <summary>
    /// Recebe <see cref="IAlertRunner"/>, não o <see cref="AlertMonitor"/> concreto:
    /// no modo hospedado (padrão da release) quem roda a verificação é o servidor
    /// (<see cref="BolsaMonitor.Core.Api.ApiAlertRunner"/>) e o monitor local nem é
    /// registrado no container — pedir o tipo concreto quebrava a shell logo após
    /// o login.
    /// </summary>
    public AlertsViewModel(IAlertRepository alerts, IMarketService market, IAlertRunner monitor)
    {
        _alerts = alerts;
        _market = market;
        _monitor = monitor;
        _selectedAssetType = AssetTypeOptions[0];
        _selectedCondition = ConditionOptions[0];
        _selectedCooldown = CooldownOptions[1];
    }

    public override string Title => "Alertas";

    public override string Subtitle => "Um e-mail é enviado quando o ativo cruza o preço-alvo.";

    public ObservableCollection<AlertItem> Alerts { get; } = new();

    public ObservableCollection<AlertEventItem> Events { get; } = new();

    public ObservableCollection<AssetTypeOption> AssetTypeOptions { get; } = new()
    {
        new AssetTypeOption(AssetType.Stock, "Bolsa (ação / FII)", "PETR4"),
        new AssetTypeOption(AssetType.Crypto, "Criptomoeda", "BTC")
    };

    public ObservableCollection<ConditionOption> ConditionOptions { get; } = new()
    {
        new ConditionOption("above", "Subir acima de"),
        new ConditionOption("below", "Cair abaixo de")
    };

    public ObservableCollection<CooldownOption> CooldownOptions { get; } = new()
    {
        new CooldownOption(15, "15 minutos"),
        new CooldownOption(60, "1 hora"),
        new CooldownOption(240, "4 horas"),
        new CooldownOption(1440, "1 dia")
    };

    [ObservableProperty]
    private string _newTicker = string.Empty;

    [ObservableProperty]
    private AssetTypeOption _selectedAssetType;

    [ObservableProperty]
    private ConditionOption _selectedCondition;

    [ObservableProperty]
    private CooldownOption _selectedCooldown;

    [ObservableProperty]
    private string _newTargetPrice = string.Empty;

    [ObservableProperty]
    private string? _formMessage;

    [ObservableProperty]
    private bool _formSucceeded;

    [ObservableProperty]
    private string? _runMessage;

    [ObservableProperty]
    private int _activeCount;

    [ObservableProperty]
    private string? _emailWarning;

    public bool HasAlerts => Alerts.Count > 0;

    public bool HasEvents => Events.Count > 0;

    public override Task LoadAsync(CancellationToken cancellationToken = default) =>
        RunGuardedAsync(async () =>
        {
            var rows = await _alerts.ListAsync(cancellationToken).ConfigureAwait(true);

            var assets = rows
                .Select(row => new AssetRef(row.Ticker, AssetTypeExtensions.FromDbValue(row.AssetType), row.CryptoId))
                .ToList();

            var quotes = assets.Count > 0
                ? await _market.GetQuoteMapAsync(assets, cancellationToken).ConfigureAwait(true)
                : new Dictionary<string, Quote>();

            Alerts.Clear();

            foreach (var row in rows)
            {
                var assetType = AssetTypeExtensions.FromDbValue(row.AssetType);
                var key = $"{assetType}:{row.Ticker.ToUpperInvariant()}";
                quotes.TryGetValue(key, out var quote);

                decimal? distance = quote is not null && row.TargetPrice > 0m
                    ? ((quote.Price - row.TargetPrice) / row.TargetPrice) * 100m
                    : null;

                Alerts.Add(new AlertItem(
                    row.Id,
                    row.Ticker.ToUpperInvariant(),
                    assetType,
                    string.Equals(row.Condition, AlertEvaluator.Below, StringComparison.OrdinalIgnoreCase)
                        ? "Abaixo de"
                        : "Acima de",
                    row.TargetPrice,
                    row.IsActive,
                    row.CooldownMinutes,
                    row.LastNotifiedAt,
                    quote?.Price,
                    distance,
                    BrlFormat.Price(row.TargetPrice),
                    quote is null ? "sem cotação" : BrlFormat.Price(quote.Price),
                    row.LastNotifiedAt is null
                        ? "nunca avisado"
                        : $"último aviso {BrlFormat.RelativeTime(row.LastNotifiedAt.Value)}"));
            }

            ActiveCount = rows.Count(row => row.IsActive);
            OnPropertyChanged(nameof(HasAlerts));

            var events = await _alerts.ListEventsAsync(MaxEvents, cancellationToken).ConfigureAwait(true);

            Events.Clear();

            foreach (var alertEvent in events)
            {
                var conditionLabel = string.Equals(alertEvent.Condition, AlertEvaluator.Below, StringComparison.OrdinalIgnoreCase)
                    ? "abaixo de"
                    : "acima de";

                Events.Add(new AlertEventItem(
                    alertEvent.Ticker.ToUpperInvariant(),
                    $"{conditionLabel} {BrlFormat.Price(alertEvent.TargetPrice)} · atingiu {BrlFormat.Price(alertEvent.PriceAtTrigger)}",
                    alertEvent.Status,
                    string.Equals(alertEvent.Status, "sent", StringComparison.OrdinalIgnoreCase) ? "enviado" : "falhou",
                    BrlFormat.DateTime(alertEvent.CreatedAt),
                    alertEvent.Provider));
            }

            OnPropertyChanged(nameof(HasEvents));
        });

    [RelayCommand]
    private Task RefreshAsync() => LoadAsync();

    [RelayCommand]
    private async Task CreateAlertAsync()
    {
        FormMessage = null;
        FormSucceeded = false;

        var ticker = NewTicker.Trim().ToUpperInvariant();

        if (ticker.Length == 0)
        {
            FormMessage = "Informe o código do ativo.";

            return;
        }

        if (!BrlFormat.TryParseDecimal(NewTargetPrice, out var targetPrice) ||
            !AlertEvaluator.IsValidTargetPrice(targetPrice))
        {
            FormMessage = "Informe um preço-alvo maior que zero.";

            return;
        }

        await RunGuardedAsync(async () =>
        {
            var assetType = SelectedAssetType.Type;
            var asset = await _market
                .ResolveAssetAsync(new AssetRef(ticker, assetType, null), CancellationToken.None)
                .ConfigureAwait(true);

            var quote = await _market.GetSingleQuoteAsync(asset, CancellationToken.None).ConfigureAwait(true);

            if (quote is null)
            {
                FormMessage = $"Não encontramos \"{ticker}\". Confira o código do ativo.";

                return;
            }

            if (assetType == AssetType.Crypto && string.IsNullOrWhiteSpace(asset.CryptoId))
            {
                FormMessage = "Não foi possível identificar essa criptomoeda. Verifique o código.";

                return;
            }

            await _alerts
                .CreateAsync(
                    asset.Ticker,
                    assetType,
                    asset.CryptoId,
                    AlertEvaluator.NormalizeCondition(SelectedCondition.Value),
                    targetPrice,
                    SelectedCooldown.Minutes,
                    CancellationToken.None)
                .ConfigureAwait(true);

            FormSucceeded = true;
            FormMessage =
                $"Alerta criado para {asset.Ticker}: avisamos quando {AlertEvaluator.DescribeCondition(SelectedCondition.Value)} {BrlFormat.Price(targetPrice)}.";

            NewTicker = string.Empty;
            NewTargetPrice = string.Empty;

            await LoadAsync().ConfigureAwait(true);
        }).ConfigureAwait(true);
    }

    [RelayCommand]
    private async Task ToggleAlertAsync(AlertItem? item)
    {
        if (item is null)
        {
            return;
        }

        await RunGuardedAsync(async () =>
        {
            await _alerts.SetActiveAsync(item.Id, !item.IsActive, CancellationToken.None).ConfigureAwait(true);
            await LoadAsync().ConfigureAwait(true);
        }).ConfigureAwait(true);
    }

    [RelayCommand]
    private async Task DeleteAlertAsync(AlertItem? item)
    {
        if (item is null)
        {
            return;
        }

        await RunGuardedAsync(async () =>
        {
            await _alerts.DeleteAsync(item.Id, CancellationToken.None).ConfigureAwait(true);
            await LoadAsync().ConfigureAwait(true);
        }).ConfigureAwait(true);
    }

    /// <summary>Verificação manual — o mesmo fluxo que o timer executa a cada 5 minutos.</summary>
    [RelayCommand]
    private async Task CheckNowAsync()
    {
        RunMessage = null;

        await RunGuardedAsync(async () =>
        {
            var summary = await _monitor.RunOnceAsync(CancellationToken.None).ConfigureAwait(true);

            RunMessage = summary switch
            {
                { Failed: > 0 } => $"Falha ao enviar {summary.Failed} e-mail(s): {summary.LastError}",
                { Sent: > 0 } => $"{summary.Sent} alerta(s) disparado(s) — e-mail enviado.",
                { Checked: 0 } => "Nenhum alerta ativo para verificar.",
                _ => $"{summary.Checked} alerta(s) verificado(s), nenhum atingiu o alvo."
            };

            await LoadAsync().ConfigureAwait(true);
        }).ConfigureAwait(true);
    }

    /// <summary>Chamado pela shell ao iniciar, para avisar sobre e-mail não configurado.</summary>
    public void SetEmailWarning(string? warning) => EmailWarning = warning;
}

public sealed record ConditionOption(string Value, string Label)
{
    public override string ToString() => Label;
}

public sealed record CooldownOption(int Minutes, string Label)
{
    public override string ToString() => Label;
}
