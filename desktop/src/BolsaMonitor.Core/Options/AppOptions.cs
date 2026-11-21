namespace BolsaMonitor.Core.Options;

/// <summary>
/// Configuração lida de `appsettings.json` (e sobrescrita por variáveis de
/// ambiente). Segredos em arquivo de configuração só são aceitáveis porque este
/// é um app desktop que roda na máquina do próprio usuário — ainda assim, o
/// `appsettings.json` fica fora do controle de versão (ver .gitignore).
/// </summary>
public sealed class AppOptions
{
    public string SupabaseUrl { get; set; } = string.Empty;

    public string SupabaseAnonKey { get; set; } = string.Empty;

    /// <summary>Opcional: Brapi funciona sem token, com limite menor.</summary>
    public string BrapiToken { get; set; } = string.Empty;

    /// <summary>Opcional: header `x-cg-demo-api-key` na CoinGecko.</summary>
    public string CoinGeckoApiKey { get; set; } = string.Empty;

    /// <summary>`resend` ou `smtp`.</summary>
    public string EmailProvider { get; set; } = "resend";

    public string ResendApiKey { get; set; } = string.Empty;

    public string ResendFrom { get; set; } = "Bolsa Monitor <onboarding@resend.dev>";

    public string SmtpHost { get; set; } = string.Empty;

    public int SmtpPort { get; set; } = 587;

    public bool SmtpSecure { get; set; }

    public string SmtpUser { get; set; } = string.Empty;

    public string SmtpPassword { get; set; } = string.Empty;

    public string SmtpFrom { get; set; } = string.Empty;

    /// <summary>
    /// Intervalo do monitor local de alertas. O cron do servidor já cobre a
    /// nuvem; este timer garante funcionamento mesmo com o app como único cliente.
    /// </summary>
    public int AlertPollMinutes { get; set; } = 5;

    public bool IsSupabaseConfigured =>
        !string.IsNullOrWhiteSpace(SupabaseUrl) && !string.IsNullOrWhiteSpace(SupabaseAnonKey);

    public bool IsResendConfigured => !string.IsNullOrWhiteSpace(ResendApiKey);

    public bool IsSmtpConfigured =>
        !string.IsNullOrWhiteSpace(SmtpHost) &&
        !string.IsNullOrWhiteSpace(SmtpUser) &&
        !string.IsNullOrWhiteSpace(SmtpPassword);

    public bool IsEmailConfigured => IsResendConfigured || IsSmtpConfigured;
}
