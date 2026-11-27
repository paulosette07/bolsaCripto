using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace BolsaMonitor.Core.Market;

/// <summary>Erro de mercado com mensagem já pronta para a interface.</summary>
public sealed class MarketDataException : Exception
{
    public MarketDataException(string message, Exception? innerException = null)
        : base(message, innerException)
    {
    }
}

/// <summary>
/// GET + JSON com timeout curto, repetição em falhas passageiras e mensagem de
/// erro útil.
///
/// O HttpClient é injetado (vem do `IHttpClientFactory`) para não estourar
/// sockets ao recriar conexões a cada requisição.
/// </summary>
public sealed class JsonHttpClient
{
    /// <summary>Uma repetição basta: rate limit de provedor público é curto.</summary>
    private const int MaxAttempts = 2;

    private static readonly TimeSpan RetryDelay = TimeSpan.FromMilliseconds(700);

    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly HttpClient _httpClient;

    public JsonHttpClient(HttpClient httpClient)
    {
        _httpClient = httpClient;
        _httpClient.Timeout = TimeSpan.FromSeconds(20);
    }

    public async Task<T> GetAsync<T>(
        string url,
        IReadOnlyDictionary<string, string>? headers = null,
        CancellationToken cancellationToken = default)
    {
        for (var attempt = 1; attempt <= MaxAttempts; attempt++)
        {
            var isLastAttempt = attempt == MaxAttempts;

            using var request = BuildRequest(url, headers);

            HttpResponseMessage response;

            try
            {
                response = await _httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
            }
            catch (TaskCanceledException exception) when (!cancellationToken.IsCancellationRequested)
            {
                throw new MarketDataException("A fonte de dados demorou demais para responder.", exception);
            }
            catch (HttpRequestException exception)
            {
                throw new MarketDataException("Não foi possível conectar à fonte de dados. Verifique sua internet.", exception);
            }

            using (response)
            {
                if (!response.IsSuccessStatusCode)
                {
                    var status = (int)response.StatusCode;

                    if (!isLastAttempt && IsTransient(status))
                    {
                        await Task.Delay(RetryDelay, cancellationToken).ConfigureAwait(false);
                        continue;
                    }

                    throw new MarketDataException(DescribeStatus(status));
                }

                try
                {
                    var payload = await response.Content
                        .ReadFromJsonAsync<T>(SerializerOptions, cancellationToken)
                        .ConfigureAwait(false);

                    if (payload is null)
                    {
                        throw new MarketDataException("A fonte de dados devolveu uma resposta vazia.");
                    }

                    return payload;
                }
                catch (JsonException exception)
                {
                    throw new MarketDataException("A fonte de dados devolveu um formato inesperado.", exception);
                }
            }
        }

        throw new MarketDataException("Não foi possível consultar a fonte de dados.");
    }

    private static HttpRequestMessage BuildRequest(string url, IReadOnlyDictionary<string, string>? headers)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.TryAddWithoutValidation("accept", "application/json");

        if (headers is not null)
        {
            foreach (var (key, value) in headers)
            {
                request.Headers.TryAddWithoutValidation(key, value);
            }
        }

        return request;
    }

    /// <summary>Falha passageira: o provedor público limita por IP e se recupera.</summary>
    private static bool IsTransient(int status) =>
        status == (int)HttpStatusCode.TooManyRequests ||
        status == (int)HttpStatusCode.ServiceUnavailable;

    private static string DescribeStatus(int status) => status switch
    {
        (int)HttpStatusCode.TooManyRequests =>
            "A fonte de dados limitou as consultas agora (HTTP 429). Aguarde alguns segundos e tente novamente.",
        (int)HttpStatusCode.ServiceUnavailable =>
            "A fonte de dados está indisponível agora (HTTP 503). Tente novamente em instantes.",
        _ => $"A fonte de dados respondeu HTTP {status}."
    };
}
