using BolsaMonitor.Core.Models;
using BolsaMonitor.Core.News;

namespace BolsaMonitor.Core.Tests;

/// <summary>
/// O parser é a parte frágil do bloco de notícias: o XML vem de terceiros e
/// muda sem aviso. Estes testes travam o contrato (o que entra e o que sai).
/// </summary>
public sealed class RssParserTests
{
    private const string SampleFeed = """
        <?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>G1</title>
            <item>
              <title>Ibovespa fecha em alta de 1,2%</title>
              <link>https://g1.globo.com/economia/noticia/ibov.ghtml</link>
              <description><p>Mercado <b>reage</b> aos dados de emprego.</p></description>
              <pubDate>Tue, 24 Nov 2026 18:30:00 -0300</pubDate>
            </item>
            <item>
              <title>Dólar recua com fluxo estrangeiro</title>
              <link>https://g1.globo.com/economia/noticia/dolar.ghtml</link>
              <pubDate>Tue, 24 Nov 2026 17:00:00 -0300</pubDate>
            </item>
            <item>
              <title>Item sem link</title>
              <description>Deve ser descartado.</description>
            </item>
          </channel>
        </rss>
        """;

    private static NewsScope Brasil => NewsScope.Brasil;

    [Fact]
    public void Parse_le_itens_com_titulo_link_e_data()
    {
        var items = RssParser.Parse(SampleFeed, "G1", Brasil);

        Assert.Equal(2, items.Count);
        Assert.Equal("Ibovespa fecha em alta de 1,2%", items[0].Title);
        Assert.Equal("https://g1.globo.com/economia/noticia/ibov.ghtml", items[0].Url);
        Assert.Equal("G1", items[0].Source);
        Assert.Equal(Brasil, items[0].Scope);
        Assert.Equal(new DateTimeOffset(2026, 11, 24, 18, 30, 0, TimeSpan.FromHours(-3)), items[0].PublishedAt);
    }

    [Fact]
    public void Parse_remove_tags_html_do_resumo_e_normaliza_espacos()
    {
        var items = RssParser.Parse(SampleFeed, "G1", Brasil);

        Assert.Equal("Mercado reage aos dados de emprego.", items[0].Summary);
        Assert.Null(items[1].Summary);
    }

    [Fact]
    public void Parse_descarta_item_sem_link()
    {
        var items = RssParser.Parse(SampleFeed, "G1", Brasil);

        Assert.DoesNotContain(items, item => item.Title == "Item sem link");
    }

    [Fact]
    public void Parse_devolve_lista_vazia_para_xml_invalido()
    {
        Assert.Empty(RssParser.Parse("<rss><channel><item>", "G1", Brasil));
        Assert.Empty(RssParser.Parse(string.Empty, "G1", Brasil));
    }

    [Fact]
    public void Parse_usa_o_veiculo_do_item_quando_existe()
    {
        const string googleFeed = """
            <rss version="2.0">
              <channel>
                <item>
                  <title>Banco central eleva juros</title>
                  <link>https://news.google.com/rss/articles/abc</link>
                  <source url="https://exemplo.com">Folha de S.Paulo</source>
                </item>
              </channel>
            </rss>
            """;

        var items = RssParser.Parse(googleFeed, "Google News", NewsScope.Mundo);

        Assert.Equal("Folha de S.Paulo", items[0].Source);
    }

    [Fact]
    public void Parse_trunca_resumo_longo_sem_cortar_palavra()
    {
        var description = string.Join(' ', Enumerable.Repeat("palavra", 60));
        var feed = $"""
            <rss version="2.0">
              <channel>
                <item>
                  <title>Resumo longo</title>
                  <link>https://exemplo.com/noticia</link>
                  <description>{description}</description>
                </item>
              </channel>
            </rss>
            """;

        var summary = RssParser.Parse(feed, "Exemplo", Brasil)[0].Summary;

        Assert.NotNull(summary);
        Assert.True(summary!.Length <= 160, $"Resumo com {summary.Length} caracteres.");
        Assert.EndsWith("…", summary);
    }

    [Theory]
    [InlineData(NewsScope.Brasil, "brasil")]
    [InlineData(NewsScope.Economia, "economia")]
    [InlineData(NewsScope.Mundo, "mundo")]
    public void Slug_e_rotulo_redondos(NewsScope scope, string slug)
    {
        Assert.Equal(slug, scope.ToSlug());
        Assert.Equal(scope, slug.FromSlug());
        Assert.False(string.IsNullOrWhiteSpace(scope.ToLabel()));
    }

    [Fact]
    public void Slug_desconhecido_cai_para_brasil()
    {
        Assert.Equal(Brasil, "qualquer-coisa".FromSlug());
        Assert.Equal(Brasil, ((string?)null).FromSlug());
    }
}
