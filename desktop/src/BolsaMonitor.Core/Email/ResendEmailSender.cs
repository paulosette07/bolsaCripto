using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;

using BolsaMonitor.Core.Options;

namespace BolsaMonitor.Core.Email;

/// <summary>
/// Envio via Resend (https://resend.com).
///
/// Sem domínio verificado, o remetente precisa ser `onboarding@resend.dev` e o
/// destinatário deve ser o e-mail dono da conta — limitação do plano gratuito.
/// </summary>
public sealed class ResendEmailSender : IEmailSender
{
    private const string Endpoint = "https://api.resend.com/emails";

    private static readonly HttpClient HttpClient = new()
    {
        Timeout = TimeSpan.FromSeconds(20)
    };

    private readonly AppOptions _options;

    public ResendEmailSender(AppOptions options)
    {
        _options = options;
    }

    public string Provider => "resend";

    public async Task<EmailSendResult> SendAsync(EmailMessage message, CancellationToken cancellationToken = default)
    {
        if (!_options.IsResendConfigured)
        {
            return EmailSendResult.Failed(Provider, "Resend não configurado (falta RESEND_API_KEY).");
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, Endpoint);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.ResendApiKey);
        request.Content = JsonContent.Create(new
        {
            from = _options.ResendFrom,
            to = new[] { message.To },
            subject = message.Subject,
            html = message.Html,
            text = message.Text
        });

        try
        {
            using var response = await HttpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
            var body = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
            {
                var error = TryReadError(body) ?? $"HTTP {(int)response.StatusCode}";

                return EmailSendResult.Failed(Provider, error);
            }

            return EmailSendResult.Sent(Provider);
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return EmailSendResult.Failed(Provider, "O Resend não respondeu a tempo.");
        }
        catch (HttpRequestException exception)
        {
            return EmailSendResult.Failed(Provider, exception.Message);
        }
    }

    private static string? TryReadError(string body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return null;
        }

        try
        {
            var payload = System.Text.Json.JsonSerializer.Deserialize<ResendError>(body);

            return payload?.Message ?? payload?.Error;
        }
        catch (System.Text.Json.JsonException)
        {
            return body.Length > 200 ? body[..200] : body;
        }
    }

    private sealed record ResendError(
        [property: JsonPropertyName("message")] string? Message,
        [property: JsonPropertyName("error")] string? Error);
}
