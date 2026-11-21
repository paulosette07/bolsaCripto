namespace BolsaMonitor.Core.Email;

/// <summary>Mensagem pronta para envio (HTML + alternativa em texto).</summary>
public sealed record EmailMessage(string To, string Subject, string Html, string Text);

/// <summary>Resultado de um envio — nunca lança para o chamador decidir.</summary>
public sealed record EmailSendResult(bool Success, string Provider, string? Error = null)
{
    public static EmailSendResult Sent(string provider) => new(true, provider);

    public static EmailSendResult Failed(string provider, string error) => new(false, provider, error);
}

/// <summary>Erro de configuração (nenhum provedor utilizável).</summary>
public sealed class EmailConfigurationException : Exception
{
    public EmailConfigurationException(string message)
        : base(message)
    {
    }
}

public interface IEmailSender
{
    /// <summary>`resend` ou `smtp`, gravado em `alert_events.provider`.</summary>
    string Provider { get; }

    Task<EmailSendResult> SendAsync(EmailMessage message, CancellationToken cancellationToken = default);
}
