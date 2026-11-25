using BolsaMonitor.Core.Formatting;
using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Desktop.ViewModels;

/// <summary>
/// Manchete pronta para a lista: título, veículo e "há quanto tempo".
/// O link fica guardado para o comando que abre o navegador.
/// </summary>
public sealed record NewsItemView(string Title, string Meta, string Url)
{
    public static NewsItemView FromItem(NewsItem item)
    {
        var when = item.PublishedAt is { } published
            ? BrlFormat.RelativeTime(published)
            : "agora";

        return new NewsItemView(item.Title, $"{item.Source} · {when}", item.Url);
    }
}
