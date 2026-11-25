namespace BolsaMonitor.Core.Models;

/// <summary>Recorte de notícias do painel. Espelha `NewsScope` da web.</summary>
public enum NewsScope
{
    Brasil,
    Economia,
    Mundo
}

public static class NewsScopeExtensions
{
    public static string ToLabel(this NewsScope scope) => scope switch
    {
        NewsScope.Economia => "Economia",
        NewsScope.Mundo => "Mundo",
        _ => "Brasil"
    };

    /// <summary>Valor usado como parâmetro de comando e em URLs.</summary>
    public static string ToSlug(this NewsScope scope) => scope switch
    {
        NewsScope.Economia => "economia",
        NewsScope.Mundo => "mundo",
        _ => "brasil"
    };

    public static NewsScope FromSlug(this string? slug) => slug?.Trim().ToLowerInvariant() switch
    {
        "economia" => NewsScope.Economia,
        "mundo" => NewsScope.Mundo,
        _ => NewsScope.Brasil
    };
}

/// <summary>
/// Manchete normalizada: título e resumo sem HTML, data já convertida de RFC 822.
/// </summary>
public sealed record NewsItem(
    string Title,
    string Url,
    string Source,
    DateTimeOffset? PublishedAt,
    NewsScope Scope,
    string? Summary);
