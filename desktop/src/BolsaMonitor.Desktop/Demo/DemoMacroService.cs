using BolsaMonitor.Core.Market;
using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Desktop.Demo;

/// <summary>
/// Indicadores e juros fictícios do modo demonstração.
///
/// Valores plausíveis e fixos, para inspecionar o painel sem rede. O ouro é
/// exibido por grama, como em produção; a onça em dólar sai da conta inversa.
/// </summary>
public sealed class DemoMacroService : IMacroService
{
    private const decimal GramsPerTroyOunce = 31.1034768m;

    private static readonly DateTimeOffset UpdatedAt = DateTimeOffset.UtcNow.AddMinutes(-3);

    public Task<IReadOnlyList<MacroQuote>> GetQuotesAsync(CancellationToken cancellationToken = default)
    {
        const decimal usd = 5.42m;
        const decimal eur = 5.88m;
        const decimal gram = 612.40m;

        IReadOnlyList<MacroQuote> quotes = new[]
        {
            new MacroQuote("usd-brl", "Dólar", "USD → BRL · comercial", usd, MacroUnit.Currency, 0.32m, 0.017m, 5.39m, 5.45m, null, UpdatedAt),
            new MacroQuote("eur-brl", "Euro", "EUR → BRL", eur, MacroUnit.Currency, -0.18m, -0.011m, 5.86m, 5.91m, null, UpdatedAt),
            new MacroQuote("gold", "Ouro", "grama · onça-troy", gram, MacroUnit.GoldGram, 0.74m, 4.51m, 607.10m, 615.20m, gram * GramsPerTroyOunce / usd, UpdatedAt),
            new MacroQuote("ibov", "Ibovespa", "B3 · índice à vista", 128_940m, MacroUnit.Index, -0.41m, -531m, 128_120m, 129_480m, null, UpdatedAt)
        };

        return Task.FromResult(quotes);
    }

    public Task<IReadOnlyList<MacroRate>> GetRatesAsync(CancellationToken cancellationToken = default)
    {
        IReadOnlyList<MacroRate> rates = new[]
        {
            new MacroRate("selic", "Selic", 13.75m, new DateOnly(2026, 11, 5), "meta definida pelo Copom"),
            new MacroRate("ipca", "IPCA", 4.63m, new DateOnly(2026, 10, 1), "acumulado em 12 meses")
        };

        return Task.FromResult(rates);
    }
}
