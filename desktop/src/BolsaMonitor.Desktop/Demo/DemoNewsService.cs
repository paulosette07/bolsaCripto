using BolsaMonitor.Core.Models;
using BolsaMonitor.Core.News;

namespace BolsaMonitor.Desktop.Demo;

/// <summary>
/// Manchetes fictícias do modo demonstração — uma lista curta por recorte,
/// com datas recentes para o painel não parecer vazio.
/// </summary>
public sealed class DemoNewsService : INewsService
{
    private static readonly NewsItem[] Brasil =
    {
        new("Ibovespa opera em queda com fiscal no radar", "https://exemplo.com/ibov", "Demo", Recent(0.5), NewsScope.Brasil, "Mercado digere a piora das projeções para as contas públicas."),
        new("Copom mantém sinal de cautela sobre a inflação", "https://exemplo.com/copom", "Demo", Recent(2), NewsScope.Brasil, "Ata reforça que a política monetária segue restritiva por ora."),
        new("Varejo registra alta acima do esperado em novembro", "https://exemplo.com/varejo", "Demo", Recent(4), NewsScope.Brasil, null),
        new("Dólar recua com entrada de capital estrangeiro", "https://exemplo.com/dolar", "Demo", Recent(6), NewsScope.Brasil, null),
        new("Bancos elevam projeção de crescimento para o próximo ano", "https://exemplo.com/pib", "Demo", Recent(9), NewsScope.Brasil, null)
    };

    private static readonly NewsItem[] Economia =
    {
        new("Bolsas americanas abrem em alta após dados de emprego", "https://exemplo.com/eua", "Demo", Recent(1), NewsScope.Economia, "Payroll acima do esperado esfria aposta em corte de juros."),
        new("Petróleo sobe com tensão no Oriente Médio", "https://exemplo.com/petroleo", "Demo", Recent(3), NewsScope.Economia, null),
        new("Minério de ferro fecha em leve queda na China", "https://exemplo.com/minerio", "Demo", Recent(5), NewsScope.Economia, null),
        new("Resultados do trimestre superam consenso do mercado", "https://exemplo.com/resultados", "Demo", Recent(7), NewsScope.Economia, null),
        new("Curva de juros futuros abre com incerteza fiscal", "https://exemplo.com/di", "Demo", Recent(11), NewsScope.Economia, null)
    };

    private static readonly NewsItem[] Mundo =
    {
        new("Banco Central Europeu sinaliza manutenção dos juros", "https://exemplo.com/bce", "Demo", Recent(1.5), NewsScope.Mundo, null),
        new("China anuncia pacote de estímulo ao consumo", "https://exemplo.com/china", "Demo", Recent(3.5), NewsScope.Mundo, null),
        new("Eleições nos EUA movimentam mercados asiáticos", "https://exemplo.com/eleicoes", "Demo", Recent(8), NewsScope.Mundo, null),
        new("FMI revisa projeção de crescimento global para cima", "https://exemplo.com/fmi", "Demo", Recent(12), NewsScope.Mundo, null),
        new("Tensão comercial pressiona cadeias de suprimento", "https://exemplo.com/comercio", "Demo", Recent(15), NewsScope.Mundo, null)
    };

    public Task<IReadOnlyList<NewsItem>> GetAsync(
        NewsScope scope,
        int limit = NewsService.DefaultLimit,
        CancellationToken cancellationToken = default)
    {
        var items = scope switch
        {
            NewsScope.Economia => Economia,
            NewsScope.Mundo => Mundo,
            _ => Brasil
        };

        return Task.FromResult<IReadOnlyList<NewsItem>>(items.Take(Math.Max(1, limit)).ToList());
    }

    private static DateTimeOffset Recent(double hoursAgo) =>
        DateTimeOffset.UtcNow.AddHours(-hoursAgo);
}
