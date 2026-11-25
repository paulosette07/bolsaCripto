using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Core.News;

/// <summary>
/// Notícias do painel por recorte (Brasil, economia, mundo).
/// Interface para o modo demonstração rodar sem rede.
/// </summary>
public interface INewsService
{
    Task<IReadOnlyList<NewsItem>> GetAsync(
        NewsScope scope,
        int limit = NewsService.DefaultLimit,
        CancellationToken cancellationToken = default);
}
