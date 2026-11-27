using BolsaMonitor.Core.Models;
using BolsaMonitor.Core.News;

namespace BolsaMonitor.Core.Api;

/// <summary>
/// Manchetes servidas por `GET /api/app/news` — o servidor já sabe quais feeds
/// assinar e como limpar o HTML, então o desktop só recebe texto pronto.
///
/// Cache curto por recorte: o painel carrega os três recortes em paralelo e
/// alterna entre eles ao trocar de aba; sem cache, cada clique viraria uma
/// requisição.
/// </summary>
public sealed class ApiNewsService : INewsService
{
    private static readonly TimeSpan CacheLifetime = TimeSpan.FromMinutes(2);

    private readonly ApiClient _api;
    private readonly Dictionary<NewsScope, (IReadOnlyList<NewsItem> Items, DateTimeOffset At)> _cache = new();

    public ApiNewsService(ApiClient api)
    {
        _api = api;
    }

    public async Task<IReadOnlyList<NewsItem>> GetAsync(
        NewsScope scope,
        int limit = NewsService.DefaultLimit,
        CancellationToken cancellationToken = default)
    {
        if (_cache.TryGetValue(scope, out var entry) &&
            DateTimeOffset.UtcNow - entry.At < CacheLifetime &&
            entry.Items.Count >= limit)
        {
            return entry.Items.Take(limit).ToList();
        }

        var json = await _api
            .GetAsync($"/api/app/news?scope={scope.ToSlug()}&limit={limit}", cancellationToken)
            .ConfigureAwait(false);

        var items = ApiJson.ParseNews(json, scope);
        _cache[scope] = (items, DateTimeOffset.UtcNow);

        return items;
    }
}
