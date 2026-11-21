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
/// GET + JSON com timeout curto e mensagem de erro útil.
///
/// O HttpClient é injetado (vem do `IHttpClientFactory`) para não estourar
/// sockets ao recriar conexões a cada requisição.
/// </summary>
public sealed class JsonHttpClient
{
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

    public async Task<T> GetAsync<T>(string url, IReadOnlyDictionary<string, string>? headers = null, CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.TryAddWithoutValidation("accept", "application/json");

        if (headers is not null)
        {
            foreach (var (key, value) in headers)
            {
                request.Headers.TryAddWithoutValidation(key, value);
            }
        }

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
                throw new MarketDataException($"A fonte de dados respondeu HTTP {(int)response.StatusCode}.");
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
}
