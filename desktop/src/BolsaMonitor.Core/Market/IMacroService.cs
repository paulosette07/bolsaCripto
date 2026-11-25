using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Core.Market;

/// <summary>
/// Indicadores macro do painel (dólar, euro, ouro, Ibovespa) e juros/inflação.
/// Existe como interface para o modo demonstração rodar sem rede, igual a
/// <see cref="IMarketService"/>.
/// </summary>
public interface IMacroService
{
    Task<IReadOnlyList<MacroQuote>> GetQuotesAsync(CancellationToken cancellationToken = default);

    Task<IReadOnlyList<MacroRate>> GetRatesAsync(CancellationToken cancellationToken = default);
}
