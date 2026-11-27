using BolsaMonitor.Core.Alerts;
using BolsaMonitor.Core.Api;
using BolsaMonitor.Core.Market;
using BolsaMonitor.Core.Models;

using Xunit;

namespace BolsaMonitor.Core.Tests;

/// <summary>
/// Trava o contrato com o servidor (`/api/app/*`).
///
/// O desktop hospedado não vê o código da web: se um campo mudar de nome, o app
/// quebraria em produção, sem build vermelho. Estes testes são a rede de
/// proteção — cada um fixa o JSON que o servidor realmente devolve hoje.
/// </summary>
public sealed class ApiJsonTests
{
    private static readonly AssetRef Petrobras = new("PETR4", AssetType.Stock, null);
    private static readonly AssetRef Bitcoin = new("BTC", AssetType.Crypto, "bitcoin");

    [Fact]
    public void ParseQuotes_le_campos_em_camelCase()
    {
        const string json = """
            {
              "quotes": [
                {
                  "ticker": "petr4",
                  "assetType": "stock",
                  "name": "Petrobras PN",
                  "price": 38.42,
                  "changePercent": 1.24,
                  "changeValue": 0.47,
                  "previousClose": 37.95,
                  "currency": "brl",
                  "updatedAt": "2026-11-27T17:05:00Z"
                }
              ],
              "currency": "BRL"
            }
            """;

        var quotes = ApiJson.ParseQuotes(json);

        var quote = Assert.Single(quotes);

        Assert.Equal("PETR4", quote.Ticker);
        Assert.Equal(AssetType.Stock, quote.AssetType);
        Assert.Equal("Petrobras PN", quote.Name);
        Assert.Equal(38.42m, quote.Price);
        Assert.Equal(1.24m, quote.ChangePercent);
        Assert.Equal(37.95m, quote.PreviousClose);
        Assert.Equal("BRL", quote.Currency);
        Assert.Equal(DateTimeOffset.Parse("2026-11-27T17:05:00Z"), quote.UpdatedAt);
    }

    [Fact]
    public void ParseQuotes_preserva_cryptoId_e_deduz_variacao_sem_valor()
    {
        const string json = """
            {
              "quotes": [
                {
                  "ticker": "BTC",
                  "assetType": "crypto",
                  "cryptoId": "bitcoin",
                  "price": 343100.50,
                  "previousClose": 340000.00,
                  "currency": "BRL"
                }
              ]
            }
            """;

        var quote = Assert.Single(ApiJson.ParseQuotes(json));

        Assert.Equal(AssetType.Crypto, quote.AssetType);
        Assert.Equal("bitcoin", quote.CryptoId);
        Assert.Equal(3100.50m, quote.ChangeValue);
        Assert.Equal(0m, quote.ChangePercent);
    }

    [Fact]
    public void ParseQuotes_descarta_entrada_sem_preco_ou_sem_ticker()
    {
        const string json = """
            {
              "quotes": [
                { "ticker": "VALE3", "price": 61.2, "currency": "BRL" },
                { "ticker": "SEMPRECO", "price": null },
                { "price": 10.0 },
                { "ticker": "  ", "price": 5.0 }
              ]
            }
            """;

        var quotes = ApiJson.ParseQuotes(json);

        var quote = Assert.Single(quotes);

        Assert.Equal("VALE3", quote.Ticker);
    }

    [Fact]
    public void ParseQuotes_aceita_numero_como_string()
    {
        // O servidor já mandou `price` como string quando o provedor devolvia
        // texto; o parser aceita as duas formas para não zerar a tela.
        const string json = """
            { "quotes": [ { "ticker": "ITUB4", "price": "32.15", "currency": "BRL" } ] }
            """;

        var quote = Assert.Single(ApiJson.ParseQuotes(json));

        Assert.Equal(32.15m, quote.Price);
    }

    [Fact]
    public void ParseHistory_ordena_pontos_e_descarta_preco_nulo()
    {
        const string json = """
            {
              "ticker": "PETR4",
              "assetType": "stock",
              "currency": "brl",
              "points": [
                { "timestamp": 3000, "price": 38.0 },
                { "timestamp": 1000, "price": 37.0 },
                { "timestamp": 2000, "price": 37.5 },
                { "timestamp": 4000, "price": null }
              ]
            }
            """;

        var history = ApiJson.ParseHistory(json, Petrobras);

        Assert.Equal("PETR4", history.Ticker);
        Assert.Equal(AssetType.Stock, history.AssetType);
        Assert.Equal("BRL", history.Currency);
        Assert.Equal(new long[] { 1000, 2000, 3000 }, history.Points.Select(point => point.Timestamp));
    }

    [Fact]
    public void ParseHistory_usa_assetRef_quando_o_payload_vem_vazio()
    {
        var history = ApiJson.ParseHistory("""{ "points": [] }""", Bitcoin);

        Assert.Equal("BTC", history.Ticker);
        Assert.Equal(AssetType.Crypto, history.AssetType);
        Assert.Equal("bitcoin", history.CryptoId);
        Assert.Equal("BRL", history.Currency);
        Assert.Empty(history.Points);
    }

    [Fact]
    public void ParseSearch_descarta_resultado_sem_ticker()
    {
        const string json = """
            {
              "results": [
                { "ticker": "vale3", "assetType": "stock", "name": "Vale ON" },
                { "ticker": "", "assetType": "stock", "name": "Vazio" },
                { "ticker": "ETH", "assetType": "crypto", "cryptoId": "ethereum", "name": "Ethereum", "logoUrl": "https://x/eth.png" }
              ]
            }
            """;

        var results = ApiJson.ParseSearch(json);

        Assert.Equal(2, results.Count);
        Assert.Equal("VALE3", results[0].Ticker);
        Assert.Equal("Vale ON", results[0].Name);
        Assert.Null(results[0].CryptoId);
        Assert.Equal("ethereum", results[1].CryptoId);
        Assert.Equal("https://x/eth.png", results[1].LogoUrl);
    }

    [Fact]
    public void ParseMacro_separa_indicadores_de_juros_e_le_a_unidade()
    {
        const string json = """
            {
              "quotes": [
                { "id": "ibov", "label": "Ibovespa", "subtitle": "B3", "value": 128450, "unit": "index", "changePercent": 0.85, "dayLow": 127900, "dayHigh": 128900 },
                { "id": "gold", "label": "Ouro", "value": 612.4, "unit": "gold-gram", "usdPerOunce": 2650.1 },
                { "id": "usd-brl", "label": "Dólar", "value": 5.42, "unit": "currency" }
              ],
              "rates": [
                { "id": "selic", "label": "Selic", "value": 13.75, "referenceDate": "2026-11-19", "note": "Copom" }
              ]
            }
            """;

        var (quotes, rates) = ApiJson.ParseMacro(json);

        Assert.Equal(3, quotes.Count);
        Assert.Equal(MacroUnit.Index, quotes[0].Unit);
        Assert.Equal(128450m, quotes[0].Value);
        Assert.Equal(127900m, quotes[0].DayLow);
        Assert.Equal(MacroUnit.GoldGram, quotes[1].Unit);
        Assert.Equal(2650.1m, quotes[1].UsdPerOunce);
        Assert.Equal(MacroUnit.Currency, quotes[2].Unit);

        var selic = Assert.Single(rates);

        Assert.Equal("Selic", selic.Label);
        Assert.Equal(13.75m, selic.Value);
        Assert.Equal(new DateOnly(2026, 11, 19), selic.ReferenceDate);
    }

    [Fact]
    public void ParseMacro_descarta_indicador_sem_valor_ou_sem_id()
    {
        const string json = """
            { "quotes": [ { "id": "eur-brl", "value": null }, { "value": 10 } ], "rates": [] }
            """;

        var (quotes, rates) = ApiJson.ParseMacro(json);

        Assert.Empty(quotes);
        Assert.Empty(rates);
    }

    [Fact]
    public void ParseNews_usa_o_escopo_do_item_e_cai_para_o_pedido()
    {
        const string json = """
            {
              "items": [
                { "title": "Copom mantém juros", "url": "https://exemplo.com/a", "source": "Folha", "publishedAt": "2026-11-27T12:00:00Z", "scope": "economia" },
                { "title": "Sem escopo", "url": "https://exemplo.com/b" },
                { "title": "", "url": "https://exemplo.com/c" },
                { "title": "Sem link" }
              ]
            }
            """;

        var items = ApiJson.ParseNews(json, NewsScope.Brasil);

        Assert.Equal(2, items.Count);
        Assert.Equal(NewsScope.Economia, items[0].Scope);
        Assert.Equal("Folha", items[0].Source);
        Assert.Equal(NewsScope.Brasil, items[1].Scope);
        Assert.Equal("Mercado", items[1].Source);
        Assert.Null(items[1].Summary);
    }

    [Fact]
    public void ParseAlertCheck_traduz_o_resumo_do_servidor()
    {
        const string json = """
            {
              "ok": true,
              "alertsChecked": 4,
              "conditionsMet": 2,
              "emailsSent": 2,
              "emailsFailed": 0,
              "alertsWithoutQuote": 1,
              "errors": []
            }
            """;

        var summary = ApiJson.ParseAlertCheck(json);

        Assert.Equal(4, summary.Checked);
        Assert.Equal(2, summary.Triggered);
        Assert.Equal(2, summary.Sent);
        Assert.Equal(0, summary.Failed);
        Assert.Null(summary.LastError);
    }

    [Fact]
    public void ParseAlertCheck_junta_os_erros_parciais()
    {
        const string json = """
            {
              "ok": true,
              "alertsChecked": 1,
              "conditionsMet": 1,
              "emailsSent": 0,
              "emailsFailed": 1,
              "errors": ["Resend recusou o destinatário", "Tente novamente"]
            }
            """;

        var summary = ApiJson.ParseAlertCheck(json);

        Assert.Equal("Resend recusou o destinatário · Tente novamente", summary.LastError);
    }

    [Fact]
    public void ParseAlertCheck_falha_quando_o_servidor_diz_que_nao_deu()
    {
        const string json = """
            { "ok": false, "error": "Não foi possível consultar as cotações agora." }
            """;

        var exception = Assert.Throws<MarketDataException>(() => ApiJson.ParseAlertCheck(json));

        Assert.Equal("Não foi possível consultar as cotações agora.", exception.Message);
    }

    [Fact]
    public void ParseFx_devolve_nulo_sem_taxa_valida()
    {
        Assert.Null(ApiJson.ParseFx("""{ "rate": 0 }"""));
        Assert.Null(ApiJson.ParseFx("""{ "rate": null }"""));
    }

    [Fact]
    public void ParseFx_le_o_snapshot_completo()
    {
        const string json = """
            {
              "rate": 5.4213,
              "changePercent": -0.35,
              "referenceDate": "2026-11-27",
              "source": "bcb",
              "fetchedAt": "2026-11-27T18:10:00Z"
            }
            """;

        var snapshot = ApiJson.ParseFx(json);

        Assert.NotNull(snapshot);
        Assert.Equal(5.4213m, snapshot!.Rate);
        Assert.Equal(-0.35m, snapshot.ChangePercent);
        Assert.Equal(new DateOnly(2026, 11, 27), snapshot.ReferenceDate);
        Assert.Equal("bcb", snapshot.Source);
    }

    [Fact]
    public void ReadError_le_a_mensagem_do_servidor_e_ignora_corpo_invalido()
    {
        Assert.Equal("Sessão expirada.", ApiJson.ReadError("""{ "error": "Sessão expirada." }"""));
        Assert.Null(ApiJson.ReadError("""{ "ok": true }"""));
        Assert.Null(ApiJson.ReadError("não é json"));
    }

    [Fact]
    public void BuildQuotesBody_monta_o_pedido_no_formato_que_o_servidor_espera()
    {
        var body = ApiJson.BuildQuotesBody([Petrobras, Bitcoin], DisplayCurrency.Usd);

        Assert.Contains("\"ticker\":\"PETR4\"", body);
        Assert.Contains("\"assetType\":\"stock\"", body);
        Assert.Contains("\"ticker\":\"BTC\"", body);
        Assert.Contains("\"assetType\":\"crypto\"", body);
        Assert.Contains("\"cryptoId\":\"bitcoin\"", body);
        Assert.Contains("\"currency\":\"USD\"", body);
    }

    [Fact]
    public void BuildQuotesBody_normaliza_o_ticker_para_maiuscula()
    {
        var body = ApiJson.BuildQuotesBody([new AssetRef("vale3", AssetType.Stock, null)], DisplayCurrency.Brl);

        Assert.Contains("\"ticker\":\"VALE3\"", body);
        Assert.Contains("\"currency\":\"BRL\"", body);
    }
}
