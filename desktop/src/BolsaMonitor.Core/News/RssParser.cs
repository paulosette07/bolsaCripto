using System.Globalization;
using System.Text.RegularExpressions;
using System.Xml.Linq;

using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Core.News;

/// <summary>
/// Leitor de RSS 2.0 dos feeds de notícia.
///
/// Separado do cliente HTTP porque é a parte que merece teste: o formato vem de
/// terceiros e muda sem aviso. Regras que o parser garante:
///  - título/link/descrição saem sem HTML e com espaço normalizado;
///  - item sem título ou sem link é descartado;
///  - data ilegível vira `null` em vez de derrubar a lista;
///  - XML malformado devolve lista vazia (o chamador só vê "sem notícias").
/// </summary>
public static class RssParser
{
    private const int MaxSummaryLength = 160;

    private static readonly Regex HtmlTagRegex = new("<[^>]*>", RegexOptions.Compiled);

    private static readonly Regex WhitespaceRegex = new("\\s+", RegexOptions.Compiled);

    public static IReadOnlyList<NewsItem> Parse(string xml, string source, NewsScope scope)
    {
        if (string.IsNullOrWhiteSpace(xml))
        {
            return Array.Empty<NewsItem>();
        }

        XDocument document;

        try
        {
            document = XDocument.Parse(xml, LoadOptions.PreserveWhitespace);
        }
        catch (System.Xml.XmlException)
        {
            return Array.Empty<NewsItem>();
        }

        var items = new List<NewsItem>();
        var seenUrls = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var element in document.Descendants().Where(node => node.Name.LocalName == "item"))
        {
            var title = CleanText(ReadChild(element, "title"));
            var url = CleanText(ReadChild(element, "link"));

            if (title.Length == 0 || !IsHttpUrl(url) || !seenUrls.Add(url))
            {
                continue;
            }

            var summary = CleanText(ReadChild(element, "description"));

            items.Add(new NewsItem(
                title,
                url,
                ResolveSource(element, source),
                ReadDate(ReadChild(element, "pubDate")),
                scope,
                summary.Length == 0 ? null : Truncate(summary, MaxSummaryLength)));
        }

        return items;
    }

    /// <summary>Google News informa o veículo original em `<source>`.</summary>
    private static string ResolveSource(XElement item, string fallback)
    {
        var tagged = CleanText(ReadChild(item, "source"));

        return tagged.Length > 0 ? tagged : fallback;
    }

    private static string? ReadChild(XElement element, string name) =>
        element.Elements().FirstOrDefault(child => child.Name.LocalName == name)?.Value;

    private static DateTimeOffset? ReadDate(string? value) =>
        DateTimeOffset.TryParse(
            CleanText(value),
            CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal,
            out var parsed)
            ? parsed
            : null;

    private static bool IsHttpUrl(string value) =>
        value.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
        value.StartsWith("https://", StringComparison.OrdinalIgnoreCase);

    /// <summary>Remove tags HTML embutidas no resumo e normaliza o espaçamento.</summary>
    private static string CleanText(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var withoutTags = HtmlTagRegex.Replace(value, " ");

        return WhitespaceRegex.Replace(withoutTags, " ").Trim();
    }

    private static string Truncate(string value, int maxLength)
    {
        if (value.Length <= maxLength)
        {
            return value;
        }

        var slice = value[..maxLength];
        var lastSpace = slice.LastIndexOf(' ');

        return (lastSpace > maxLength * 0.6 ? slice[..lastSpace] : slice).TrimEnd() + "…";
    }
}
