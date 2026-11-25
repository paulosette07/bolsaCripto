using System.Globalization;
using System.Text;

using BolsaMonitor.Core.Market;
using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Core.News;

/// <summary>
/// Notícias do painel, espelhando `web/lib/news` (mesmas fontes e regras).
///
/// Cada feed falha sozinho: um veículo fora do ar não zera o bloco. O resultado
/// é ordenado do mais recente para o mais antigo e manchetes repetidas entre
/// veículos são descartadas pelo começo do título.
/// </summary>
public sealed class NewsService : INewsService
{
    public const int DefaultLimit = 6;

    private const int MaxItemsPerFeed = 12;

    private static readonly IReadOnlyDictionary<NewsScope, (string Source, string Url)[]> Feeds =
        new Dictionary<NewsScope, (string Source, string Url)[]>
        {
            [NewsScope.Brasil] = new[]
            {
                ("G1", "https://g1.globo.com/rss/g1/"),
                ("CNN Brasil", "https://www.cnnbrasil.com.br/feed/")
            },
            [NewsScope.Economia] = new[]
            {
                ("InfoMoney", "https://www.infomoney.com.br/feed/"),
                ("G1 Economia", "https://g1.globo.com/rss/g1/economia/")
            },
            [NewsScope.Mundo] = new[]
            {
                ("G1 Mundo", "https://g1.globo.com/rss/g1/mundo/"),
                ("Google News", "https://news.google.com/rss/headlines/section/topic/WORLD?hl=pt-BR&gl=BR&ceid=BR:pt-419")
            }
        };

    private readonly HttpClient _httpClient;

    public NewsService(HttpClient httpClient)
    {
        _httpClient = httpClient;
        _httpClient.Timeout = TimeSpan.FromSeconds(20);
    }

    public async Task<IReadOnlyList<NewsItem>> GetAsync(
        NewsScope scope,
        int limit = DefaultLimit,
        CancellationToken cancellationToken = default)
    {
        if (!Feeds.TryGetValue(scope, out var feeds))
        {
            return Array.Empty<NewsItem>();
        }

        var tasks = feeds.Select(feed => FetchAsync(feed.Source, feed.Url, scope, cancellationToken));
        var results = await Task.WhenAll(tasks).ConfigureAwait(false);

        return results
            .SelectMany(items => items)
            .OrderByDescending(item => item.PublishedAt ?? DateTimeOffset.MinValue)
            .GroupBy(item => HeadlineKey(item.Title), StringComparer.Ordinal)
            .Select(group => group.First())
            .Take(Math.Max(1, limit))
            .ToList();
    }

    private async Task<IReadOnlyList<NewsItem>> FetchAsync(
        string source,
        string url,
        NewsScope scope,
        CancellationToken cancellationToken)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.TryAddWithoutValidation(
                "accept",
                "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5");
            request.Headers.TryAddWithoutValidation(
                "user-agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

            using var response = await _httpClient
                .SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken)
                .ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
            {
                return Array.Empty<NewsItem>();
            }

            var xml = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);

            return RssParser.Parse(xml, source, scope).Take(MaxItemsPerFeed).ToList();
        }
        catch (Exception exception) when (
            exception is HttpRequestException or TaskCanceledException or MarketDataException)
        {
            return Array.Empty<NewsItem>();
        }
    }

    /// <summary>Chave de comparação de manchete: sem caixa, acento ou pontuação.</summary>
    private static string HeadlineKey(string title)
    {
        var normalized = title.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(normalized.Length);
        var previousWasSpace = false;

        foreach (var character in normalized)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) == UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            if (char.IsLetterOrDigit(character))
            {
                builder.Append(char.ToLowerInvariant(character));
                previousWasSpace = false;
            }
            else if (!previousWasSpace)
            {
                builder.Append(' ');
                previousWasSpace = true;
            }
        }

        var key = builder.ToString().Trim();

        return key.Length <= 60 ? key : key[..60];
    }
}
