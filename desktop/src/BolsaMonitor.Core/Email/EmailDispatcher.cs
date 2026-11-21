using BolsaMonitor.Core.Options;

namespace BolsaMonitor.Core.Email;

/// <summary>
/// Escolhe e executa o envio com fallback mútuo.
///
/// O provedor preferido (config `EmailProvider`) é tentado primeiro; se falhar
/// por qualquer motivo — chave ausente, domínio não verificado, SMTP bloqueado —
/// o outro é tentado antes de reportar erro ao usuário.
/// </summary>
public sealed class EmailDispatcher
{
    private readonly IReadOnlyList<IEmailSender> _candidates;

    public EmailDispatcher(AppOptions options)
        : this(BuildCandidates(options))
    {
    }

    public EmailDispatcher(IReadOnlyList<IEmailSender> candidates)
    {
        _candidates = candidates;
    }

    public bool IsConfigured => _candidates.Count > 0;

    public IReadOnlyList<string> Providers => _candidates.Select(candidate => candidate.Provider).ToList();

    /// <summary>
    /// Tenta cada provedor em ordem. Retorna o primeiro sucesso ou a última
    /// falha — nunca lança, para o monitor de alertas registrar o evento.
    /// </summary>
    public async Task<EmailSendResult> SendAsync(EmailMessage message, CancellationToken cancellationToken = default)
    {
        if (_candidates.Count == 0)
        {
            return EmailSendResult.Failed("none", "Nenhum provedor de e-mail configurado.");
        }

        EmailSendResult? lastFailure = null;

        foreach (var candidate in _candidates)
        {
            var result = await candidate.SendAsync(message, cancellationToken).ConfigureAwait(false);

            if (result.Success)
            {
                return result;
            }

            lastFailure = result;
        }

        return lastFailure ?? EmailSendResult.Failed("none", "Nenhum provedor conseguiu enviar.");
    }

    private static IReadOnlyList<IEmailSender> BuildCandidates(AppOptions options)
    {
        var resend = options.IsResendConfigured ? new ResendEmailSender(options) : null;
        var smtp = options.IsSmtpConfigured ? new SmtpEmailSender(options) : null;

        var prefersSmtp = string.Equals(options.EmailProvider, "smtp", StringComparison.OrdinalIgnoreCase);

        var ordered = prefersSmtp
            ? new IEmailSender?[] { smtp, resend }
            : new IEmailSender?[] { resend, smtp };

        return ordered.Where(sender => sender is not null).Select(sender => sender!).ToList();
    }
}
