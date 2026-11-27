using BolsaMonitor.Core.Market;
using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Desktop.Demo;

/// <summary>
/// Dólar fixo do modo demonstração.
///
/// Mesmo valor que o <see cref="DemoMarketService"/> usa para converter cripto:
/// se os dois divergissem, o demo mostraria um câmbio na faixa e outro dentro da
/// tabela de cotações — e a diferença pareceria um bug do app.
/// </summary>
public sealed class DemoUsdRateService : IUsdRateService
{
    private const decimal DemoRate = 5.42m;
    private const decimal DemoChangePercent = 0.37m;

    public Task<UsdRateSnapshot?> GetAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult<UsdRateSnapshot?>(new UsdRateSnapshot(
            DemoRate,
            DemoChangePercent,
            DateOnly.FromDateTime(DateTime.Today),
            "demo",
            DateTimeOffset.UtcNow));
}
