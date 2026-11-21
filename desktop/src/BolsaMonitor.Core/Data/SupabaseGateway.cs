using BolsaMonitor.Core.Options;
using BolsaMonitor.Core.Persistence;

using Supabase;

namespace BolsaMonitor.Core.Data;

/// <summary>Resultado de uma tentativa de login.</summary>
public sealed record AuthOutcome(bool Success, string? Error = null, bool EmailNotConfirmed = false);

/// <summary>
/// Dono único do `Supabase.Client` e da sessão no desktop.
///
/// O SDK é inicializado uma vez e reutilizado: criar um cliente por tela
/// multiplicaria conexões e perderia o refresh automático do token.
/// </summary>
public sealed class SupabaseGateway
{
    private readonly AppOptions _options;
    private readonly SessionStore _sessionStore;
    private Supabase.Client? _client;
    private DemoIdentity? _demo;

    /// <summary>Identidade fictícia do modo demonstração (sem Supabase, sem rede).</summary>
    private sealed record DemoIdentity(string UserId, string Email, string? FullName);

    public SupabaseGateway(AppOptions options, SessionStore sessionStore)
    {
        _options = options;
        _sessionStore = sessionStore;
    }

    public Supabase.Client Client =>
        _client ?? throw new InvalidOperationException("O cliente Supabase ainda não foi inicializado.");

    public bool IsSignedIn => _demo is not null || _client?.Auth.CurrentUser is not null;

    public bool IsDemoMode => _demo is not null;

    public string? UserId => _demo?.UserId ?? _client?.Auth.CurrentUser?.Id;

    public string? Email => _demo?.Email ?? _client?.Auth.CurrentUser?.Email;

    public string? FullName
    {
        get
        {
            if (_demo is not null)
            {
                return _demo.FullName;
            }

            return _client?.Auth.CurrentUser?.UserMetadata is { } metadata &&
                   metadata.TryGetValue("full_name", out var value)
                ? value?.ToString()
                : null;
        }
    }

    /// <summary>
    /// Injeta uma identidade fictícia. Usado apenas pelo modo demonstração, para
    /// abrir as telas sem projeto Supabase configurado.
    /// </summary>
    public void UseDemoIdentity(string userId, string email, string? fullName) =>
        _demo = new DemoIdentity(userId, email, fullName);

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        if (_client is not null)
        {
            return;
        }

        if (!_options.IsSupabaseConfigured)
        {
            throw new InvalidOperationException(
                "Configure SupabaseUrl e SupabaseAnonKey em appsettings.json antes de entrar.");
        }

        var clientOptions = new SupabaseOptions
        {
            AutoRefreshToken = true,
            AutoConnectRealtime = false
        };

        _client = new Supabase.Client(_options.SupabaseUrl, _options.SupabaseAnonKey, clientOptions);

        await _client.InitializeAsync().ConfigureAwait(false);

        cancellationToken.ThrowIfCancellationRequested();
    }

    public async Task<AuthOutcome> SignInAsync(string email, string password, CancellationToken cancellationToken = default)
    {
        await InitializeAsync(cancellationToken).ConfigureAwait(false);

        try
        {
            var session = await Client.Auth.SignIn(email.Trim(), password).ConfigureAwait(false);

            if (session?.AccessToken is null || session.RefreshToken is null)
            {
                return new AuthOutcome(false, "Não foi possível iniciar a sessão.");
            }

            _sessionStore.Save(new StoredSession(session.AccessToken, session.RefreshToken));

            return new AuthOutcome(true);
        }
        catch (Exception exception)
        {
            return new AuthOutcome(false, TranslateAuthError(exception.Message), IsEmailNotConfirmed(exception.Message));
        }
    }

    /// <summary>Tenta reaproveitar a sessão gravada; falso quando não há sessão válida.</summary>
    public async Task<bool> TryRestoreSessionAsync(CancellationToken cancellationToken = default)
    {
        await InitializeAsync(cancellationToken).ConfigureAwait(false);

        var stored = _sessionStore.Load();

        if (stored is null)
        {
            return false;
        }

        try
        {
            await Client.Auth.SetSession(stored.AccessToken, stored.RefreshToken).ConfigureAwait(false);

            return Client.Auth.CurrentUser is not null;
        }
        catch (Exception)
        {
            // Token revogado/expirado sem refresh: começa do login.
            _sessionStore.Clear();

            return false;
        }
    }

    public async Task SignOutAsync()
    {
        if (_demo is not null)
        {
            _demo = null;

            return;
        }

        try
        {
            if (_client is not null)
            {
                await _client.Auth.SignOut().ConfigureAwait(false);
            }
        }
        catch (Exception)
        {
            // Sair localmente é o que importa; o token remoto expira sozinho.
        }
        finally
        {
            _sessionStore.Clear();
        }
    }

    private static bool IsEmailNotConfirmed(string message) =>
        message.Contains("Email not confirmed", StringComparison.OrdinalIgnoreCase) ||
        message.Contains("email_not_confirmed", StringComparison.OrdinalIgnoreCase);

    /// <summary>Traduz os erros mais comuns do GoTrue para pt-BR.</summary>
    private static string TranslateAuthError(string message)
    {
        if (IsEmailNotConfirmed(message))
        {
            return "Confirme seu e-mail antes de entrar. Verifique a caixa de entrada.";
        }

        if (message.Contains("Invalid login credentials", StringComparison.OrdinalIgnoreCase))
        {
            return "E-mail ou senha incorretos.";
        }

        if (message.Contains("Email rate limit exceeded", StringComparison.OrdinalIgnoreCase))
        {
            return "Muitas tentativas em pouco tempo. Aguarde alguns minutos.";
        }

        if (message.Contains("User not found", StringComparison.OrdinalIgnoreCase))
        {
            return "Não existe conta com este e-mail.";
        }

        return message;
    }
}
