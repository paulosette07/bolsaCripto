using System.Globalization;
using System.Text.Json;

namespace BolsaMonitor.Core.Market;

/// <summary>
/// Câmbio USD → BRL para o desktop. Espelha `web/lib/market/fx.ts`.
///
/// A CoinGecko é consultada **sempre em reais** e o dólar é derivado desta
/// taxa. Pedir `vs_currency=usd` também criava uma segunda URL por moeda — e
/// alternar real/dólar virava uma rajada de requisições que terminava em HTTP
/// 429 na API pública.
///
/// Fontes, em ordem:
///  1. **BCB SGS 10813** (dólar comercial de venda), oficial e sem chave;
///  2. **AwesomeAPI** (`USD-BRL`), quando o BCB não responde.
///
/// Sem nenhuma das duas o resultado é `null` e quem chama volta a consultar a
/// moeda final direto na fonte — nunca convertemos por um número inventado.
/// </summary>
public sealed class UsdBrlRateProvider
{
    private const string BcbUrl =
        "https://api.bcb.gov.br/dados/serie/bcdata.sgs.10813/dados/ultimos/1?formato=json";

    private const string AwesomeUrl = "https://economia.awesomeapi.com.br/last/USD-BRL";

    /// <summary>Câmbio não muda a cada minuto; 30 min evita chamada por clique.</summary>
    private static readonly TimeSpan CacheLifetime = TimeSpan.FromMinutes(30);

    private readonly HttpClient _httpClient;
    private readonly SemaphoreSlim _gate = new(1, 1);

    private decimal? _cachedRate;
    private DateTimeOffset _cachedAt = DateTimeOffset.MinValue;

    public UsdBrlRateProvider(HttpClient httpClient)
    {
        _httpClient = httpClient;
        _httpClient.Timeout = TimeSpan.FromSeconds(15);
    }

    /// <summary>Quantos reais vale 1 dólar. `null` quando nenhuma fonte respondeu.</summary>
    public async Task<decimal?> GetRateAsync(CancellationToken cancellationToken = default)
    {
        var cached = ReadCache();

        if (cached is not null)
        {
            return cached;
        }

        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);

        try
        {
            cached = ReadCache();

            if (cached is not null)
            {
                return cached;
            }

            var rate = await FetchFromBcbAsync(cancellationToken).ConfigureAwait(false)
                ?? await FetchFromAwesomeAsync(cancellationToken).ConfigureAwait(false);

            if (rate is not null)
            {
                _cachedRate = rate;
                _cachedAt = DateTimeOffset.UtcNow;
            }

            return rate;
        }
        finally
        {
            _gate.Release();
        }
    }

    private decimal? ReadCache() =>
        _cachedRate is not null && DateTimeOffset.UtcNow - _cachedAt < CacheLifetime
            ? _cachedRate
            : null;

    private async Task<decimal?> FetchFromBcbAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var document = await GetJsonAsync(BcbUrl, cancellationToken).ConfigureAwait(false);
            var root = document.RootElement;

            if (root.ValueKind != JsonValueKind.Array || root.GetArrayLength() == 0)
            {
                return null;
            }

            var latest = root[root.GetArrayLength() - 1];

            if (!latest.TryGetProperty("valor", out var valor) ||
                valor.ValueKind != JsonValueKind.String)
            {
                return null;
            }

            // O BCB publica "5,7487" (vírgula decimal).
            var parsed = ParseDecimal(valor.GetString(), allowComma: true);

            return IsPlausible(parsed) ? parsed : null;
        }
        catch (Exception exception) when (IsTransportFailure(exception))
        {
            return null;
        }
    }

    private async Task<decimal?> FetchFromAwesomeAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var document = await GetJsonAsync(AwesomeUrl, cancellationToken).ConfigureAwait(false);
            var root = document.RootElement;

            if (!root.TryGetProperty("USDBRL", out var pair) ||
                !pair.TryGetProperty("bid", out var bid) ||
                bid.ValueKind != JsonValueKind.String)
            {
                return null;
            }

            var parsed = ParseDecimal(bid.GetString(), allowComma: false);

            return IsPlausible(parsed) ? parsed : null;
        }
        catch (Exception exception) when (IsTransportFailure(exception))
        {
            return null;
        }
    }

    /// <summary>Dólar entre 1 e 20 reais: fora disso é erro de parsing.</summary>
    private static bool IsPlausible(decimal? value) =>
        value is > 1m and < 20m;

    private static decimal? ParseDecimal(string? raw, bool allowComma)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        var normalized = allowComma ? raw.Trim().Replace(',', '.') : raw.Trim();

        return decimal.TryParse(normalized, NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : null;
    }

    private static bool IsTransportFailure(Exception exception) =>
        exception is MarketDataException or HttpRequestException or JsonException or TaskCanceledException;

    private async Task<JsonDocument> GetJsonAsync(string url, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.TryAddWithoutValidation("accept", "application/json");

        using var response = await _httpClient
            .SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken)
            .ConfigureAwait(false);

        if (!response.IsSuccessStatusCode)
        {
            throw new MarketDataException($"A fonte de dados respondeu HTTP {(int)response.StatusCode}.");
        }

        await using var stream = await response.Content
            .ReadAsStreamAsync(cancellationToken)
            .ConfigureAwait(false);

        return await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);
    }
}
