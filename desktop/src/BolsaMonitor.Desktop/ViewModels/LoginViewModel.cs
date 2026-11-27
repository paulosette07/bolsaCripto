using BolsaMonitor.Core.Data;
using BolsaMonitor.Core.Options;

using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace BolsaMonitor.Desktop.ViewModels;

/// <summary>
/// Tela de entrada.
///
/// A senha chega por `Password` porque `PasswordBox.Password` não é uma
/// DependencyProperty e, por design, não pode ser ligada em XAML — o
/// code-behind empurra o valor para cá a cada tecla.
/// </summary>
public sealed partial class LoginViewModel : ObservableObject
{
    private readonly SupabaseGateway _gateway;
    private readonly AppOptions _options;

    public LoginViewModel(SupabaseGateway gateway, AppOptions options, RateTickerViewModel rateTicker)
    {
        _gateway = gateway;
        _options = options;
        RateTicker = rateTicker;

        // Passa pela propriedade (e não pelo campo) para disparar o aviso de
        // configuração — escrever no campo deixava a caixa vazia na tela.
        IsConfigurationMissing = !options.IsSupabaseConfigured;
    }

    /// <summary>Disparado quando a autenticação termina com sucesso.</summary>
    public event EventHandler? SignedIn;

    /// <summary>
    /// Faixa do dólar no rodapé desta janela: o visitante já vê a cotação antes
    /// de ter conta. A rota `/api/fx` é pública justamente por isso.
    /// </summary>
    public RateTickerViewModel RateTicker { get; }

    [ObservableProperty]
    private string _email = string.Empty;

    [ObservableProperty]
    private string _password = string.Empty;

    [ObservableProperty]
    private string? _errorMessage;

    [ObservableProperty]
    private bool _isBusy;

    [ObservableProperty]
    private bool _isConfigurationMissing;

    [ObservableProperty]
    private string? _configurationHint;

    public bool CanSubmit => !IsBusy && !IsConfigurationMissing;

    partial void OnIsBusyChanged(bool value) => OnPropertyChanged(nameof(CanSubmit));

    partial void OnIsConfigurationMissingChanged(bool value)
    {
        ConfigurationHint = value
            ? "Edite o appsettings.json com SupabaseUrl e SupabaseAnonKey (veja appsettings.example.json)."
            : null;

        OnPropertyChanged(nameof(CanSubmit));
    }

    [RelayCommand]
    private async Task SignInAsync()
    {
        if (IsBusy)
        {
            return;
        }

        ErrorMessage = null;

        if (string.IsNullOrWhiteSpace(Email) || string.IsNullOrEmpty(Password))
        {
            ErrorMessage = "Informe e-mail e senha.";

            return;
        }

        IsBusy = true;

        try
        {
            var outcome = await _gateway.SignInAsync(Email, Password).ConfigureAwait(true);

            if (!outcome.Success)
            {
                ErrorMessage = outcome.EmailNotConfirmed
                    ? "Confirme seu e-mail antes de entrar. O link foi enviado no cadastro (verifique o spam)."
                    : outcome.Error ?? "Não foi possível entrar.";

                return;
            }

            Password = string.Empty;
            SignedIn?.Invoke(this, EventArgs.Empty);
        }
        catch (InvalidOperationException exception)
        {
            IsConfigurationMissing = true;
            ErrorMessage = exception.Message;
        }
        catch (Exception exception)
        {
            ErrorMessage = $"Falha ao conectar no Supabase: {exception.Message}";
        }
        finally
        {
            IsBusy = false;
        }
    }

    /// <summary>Tenta reabrir a sessão salva; retorna verdadeiro se conseguiu.</summary>
    public async Task<bool> TryRestoreAsync()
    {
        if (!_options.IsSupabaseConfigured)
        {
            return false;
        }

        try
        {
            IsBusy = true;

            var restored = await _gateway.TryRestoreSessionAsync().ConfigureAwait(true);

            return restored;
        }
        catch (Exception)
        {
            return false;
        }
        finally
        {
            IsBusy = false;
        }
    }
}
