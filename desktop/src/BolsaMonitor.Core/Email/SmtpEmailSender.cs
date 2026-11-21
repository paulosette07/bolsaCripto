using MailKit.Net.Smtp;
using MailKit.Security;

using MimeKit;
using MimeKit.Text;

using BolsaMonitor.Core.Options;

namespace BolsaMonitor.Core.Email;

/// <summary>
/// Envio por SMTP autenticado (Gmail com senha de app, Outlook, etc.).
///
/// É o caminho quando não existe domínio verificado no Resend. Gmail exige
/// "senha de app" — a senha da conta é recusada desde 2022.
/// </summary>
public sealed class SmtpEmailSender : IEmailSender
{
    private readonly AppOptions _options;

    public SmtpEmailSender(AppOptions options)
    {
        _options = options;
    }

    public string Provider => "smtp";

    public async Task<EmailSendResult> SendAsync(EmailMessage message, CancellationToken cancellationToken = default)
    {
        if (!_options.IsSmtpConfigured)
        {
            return EmailSendResult.Failed(Provider, "SMTP não configurado (faltam host, usuário ou senha).");
        }

        var mime = new MimeMessage();
        var fromAddress = string.IsNullOrWhiteSpace(_options.SmtpFrom) ? _options.SmtpUser : _options.SmtpFrom;

        try
        {
            mime.From.Add(MailboxAddress.Parse(fromAddress));
            mime.To.Add(MailboxAddress.Parse(message.To));
            mime.Subject = message.Subject;
            mime.Body = new BodyBuilder
            {
                HtmlBody = message.Html,
                TextBody = message.Text
            }.ToMessageBody();
        }
        catch (ParseException)
        {
            return EmailSendResult.Failed(Provider, "Endereço de e-mail inválido na configuração ou no destinatário.");
        }

        using var client = new SmtpClient();

        try
        {
            var secureOptions = _options.SmtpSecure
                ? SecureSocketOptions.SslOnConnect
                : SecureSocketOptions.StartTlsWhenAvailable;

            await client.ConnectAsync(_options.SmtpHost, _options.SmtpPort, secureOptions, cancellationToken)
                .ConfigureAwait(false);

            await client.AuthenticateAsync(_options.SmtpUser, _options.SmtpPassword, cancellationToken)
                .ConfigureAwait(false);

            await client.SendAsync(mime, cancellationToken).ConfigureAwait(false);
            await client.DisconnectAsync(true, cancellationToken).ConfigureAwait(false);

            return EmailSendResult.Sent(Provider);
        }
        catch (AuthenticationException exception)
        {
            return EmailSendResult.Failed(Provider, $"Autenticação recusada: {exception.Message}");
        }
        catch (SmtpCommandException exception)
        {
            return EmailSendResult.Failed(Provider, $"SMTP recusou o envio: {exception.Message}");
        }
        catch (SmtpProtocolException exception)
        {
            return EmailSendResult.Failed(Provider, $"Falha de protocolo SMTP: {exception.Message}");
        }
        catch (Exception exception) when (exception is System.Net.Sockets.SocketException or IOException)
        {
            return EmailSendResult.Failed(Provider, $"Não foi possível conectar em {_options.SmtpHost}:{_options.SmtpPort}.");
        }
    }
}
