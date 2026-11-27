namespace BolsaMonitor.Core.Options;

/// <summary>
/// Configuração lida de `appsettings.json` (e sobrescrita por variáveis de
/// ambiente). Segredos em arquivo de configuração só são aceitáveis porque este
/// é um app desktop que roda na máquina do próprio usuário — ainda assim, o
/// `appsettings.json` fica fora do controle de versão (ver .gitignore).
///
/// **Dois modos de operação**, decididos por <see cref="ApiBaseUrl"/>:
///
///  - **hospedado** (padrão da release): com `ApiBaseUrl` preenchido, os dados
///    de mercado vêm do servidor do Bolsa Monitor e nenhuma chave de provider
///    precisa existir aqui. É o que permite baixar o app e usar sem configurar
///    nada — e sem expor as chaves de quem mantém o serviço;
///  - **direto**: com `ApiBaseUrl` vazio, o app fala com Brapi/CoinGecko/Yahoo
///    usando as chaves deste arquivo. É o modo de quem baixou o **código**.
/// </summary>
public sealed class AppOptions
{
    /// <summary>
    /// Base da API do Bolsa Monitor (ex.: `https://bolsa-monitor.vercel.app`).
    /// Preenchida = modo hospedado. Vazia = modo direto.
    /// </summary>
    public string ApiBaseUrl { get; set; } = string.Empty;

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

    /// <summary>
    /// `true` quando os dados de mercado vêm do servidor do Bolsa Monitor.
    /// Nesse modo Brapi/CoinGecko/Yahoo/Resend **não** são consultados aqui.
    /// </summary>
    public bool UseHostedApi => !string.IsNullOrWhiteSpace(ApiBaseUrl);

    public bool IsSupabaseConfigured =>
        !string.IsNullOrWhiteSpace(SupabaseUrl) && !string.IsNullOrWhiteSpace(SupabaseAnonKey);

    public bool IsResendConfigured => !string.IsNullOrWhiteSpace(ResendApiKey);

    public bool IsSmtpConfigured =>
        !string.IsNullOrWhiteSpace(SmtpHost) &&
        !string.IsNullOrWhiteSpace(SmtpUser) &&
        !string.IsNullOrWhiteSpace(SmtpPassword);

    public bool IsEmailConfigured => IsResendConfigured || IsSmtpConfigured;
}
