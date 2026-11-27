using System.Net;
using System.Text;

using BolsaMonitor.Core.Data;
using BolsaMonitor.Core.Market;
using BolsaMonitor.Core.Options;

namespace BolsaMonitor.Core.Api;

/// <summary>
/// Cliente HTTP do servidor do Bolsa Monitor — usado no **modo hospedado**, que
/// é o padrão da release.
///
/// A ideia central: a release não embarca token da Brapi, chave da CoinGecko
/// nem credencial de e-mail. Ela conversa com `bolsa-monitor.vercel.app`, que já
/// tem tudo isso configurado, e se identifica com o **token do próprio
/// usuário** (`Authorization: Bearer`). Nenhum segredo do mantenedor sai do
/// servidor.
///
/// Toda falha chega como <see cref="MarketDataException"/> com mensagem pronta
/// para a tela — o mesmo contrato que os providers diretos usam, então as
/// ViewModels não sabem (nem precisam saber) de onde veio o número.
/// </summary>
public sealed class ApiClient
{
    private const string BearerPrefix = "Bearer ";

    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(30);

    private readonly HttpClient _httpClient;
    private readonly SupabaseGateway _gateway;
    private readonly string _baseUrl;

    public ApiClient(HttpClient httpClient, SupabaseGateway gateway, AppOptions options)
    {
        _httpClient = httpClient;
        _httpClient.Timeout = RequestTimeout;
        _gateway = gateway;
        _baseUrl = options.ApiBaseUrl.TrimEnd('/');
    }

    /// <summary>GET autenticado pelo token da sessão atual.</summary>
    public async Task<string> GetAsync(string path, CancellationToken cancellationToken = default)
    {
        var token = await RequireTokenAsync(cancellationToken).ConfigureAwait(false);

        using var request = new HttpRequestMessage(HttpMethod.Get, BuildUrl(path));
        request.Headers.TryAddWithoutValidation("accept", "application/json");
        request.Headers.TryAddWithoutValidation("authorization", BearerPrefix + token);

        return await SendAsync(request, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>POST autenticado com corpo JSON (já serializado).</summary>
    public async Task<string> PostAsync(
        string path,
        string jsonBody,
        CancellationToken cancellationToken = default)
    {
        var token = await RequireTokenAsync(cancellationToken).ConfigureAwait(false);

        using var request = new HttpRequestMessage(HttpMethod.Post, BuildUrl(path))
        {
            Content = new StringContent(jsonBody, Encoding.UTF8, "application/json")
        };

        request.Headers.TryAddWithoutValidation("accept", "application/json");
        request.Headers.TryAddWithoutValidation("authorization", BearerPrefix + token);

        return await SendAsync(request, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>GET sem token — usado pela cotação do dólar, que é pública.</summary>
    public async Task<string> GetPublicAsync(string path, CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, BuildUrl(path));
        request.Headers.TryAddWithoutValidation("accept", "application/json");

        return await SendAsync(request, cancellationToken).ConfigureAwait(false);
    }

    private string BuildUrl(string path) =>
        $"{_baseUrl}{(path.StartsWith('/') ? path : $"/{path}")}";

    private async Task<string> RequireTokenAsync(CancellationToken cancellationToken)
    {
        var token = await _gateway.GetAccessTokenAsync(cancellationToken).ConfigureAwait(false);

        if (string.IsNullOrWhiteSpace(token))
        {
            throw new MarketDataException("Sua sessão expirou. Entre novamente para continuar.");
        }

        return token;
    }

    private async Task<string> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        HttpResponseMessage response;

        try
        {
            response = await _httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
        }
        catch (TaskCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw new MarketDataException("O servidor do Bolsa Monitor demorou demais para responder.", exception);
        }
        catch (HttpRequestException exception)
        {
            throw new MarketDataException(
                "Não foi possível conectar ao servidor do Bolsa Monitor. Verifique sua internet.",
                exception);
        }

        using (response)
        {
            var body = await response.Content
                .ReadAsStringAsync(cancellationToken)
                .ConfigureAwait(false);

            if (response.IsSuccessStatusCode)
            {
                return body;
            }

            throw new MarketDataException(DescribeFailure(response.StatusCode, body));
        }
    }

    private static string DescribeFailure(HttpStatusCode status, string body)
    {
        // O servidor manda a razão em `{ "error": "..." }`; ela é melhor que
        // qualquer texto genérico que a gente invente aqui.
        var serverMessage = ApiJson.ReadError(body);

        if (!string.IsNullOrWhiteSpace(serverMessage))
        {
            return serverMessage!;
        }

        return status switch
        {
            HttpStatusCode.Unauthorized =>
                "Sua sessão expirou. Entre novamente para continuar.",
            HttpStatusCode.TooManyRequests =>
                "O servidor limitou as consultas agora. Aguarde alguns segundos.",
            HttpStatusCode.ServiceUnavailable =>
                "O servidor está indisponível agora. Tente novamente em instantes.",
            _ => $"O servidor do Bolsa Monitor respondeu HTTP {(int)status}."
        };
    }
}
