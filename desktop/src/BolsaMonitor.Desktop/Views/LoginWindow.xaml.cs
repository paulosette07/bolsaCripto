using System.Windows;
using System.Windows.Controls;

using BolsaMonitor.Desktop.Interop;
using BolsaMonitor.Desktop.ViewModels;

namespace BolsaMonitor.Desktop.Views;

/// <summary>
/// Janela de entrada.
///
/// O code-behind existe por um motivo técnico: `PasswordBox.Password` não é
/// bindável por design (evita que a senha seja exposta em memória gerenciada
/// por binding), então o valor é copiado para a ViewModel a cada tecla.
/// </summary>
public partial class LoginWindow : Window
{
    private readonly LoginViewModel _viewModel;

    public LoginWindow(LoginViewModel viewModel)
    {
        _viewModel = viewModel;
        DataContext = viewModel;

        InitializeComponent();

        DarkTitleBar.Apply(this);

        _viewModel.SignedIn += OnSignedIn;
        Loaded += OnLoaded;
        Closed += (_, _) => _viewModel.SignedIn -= OnSignedIn;
    }

    /// <summary>Verdadeiro quando a janela fechou por login bem-sucedido.</summary>
    public bool Authenticated { get; private set; }

    private void OnLoaded(object sender, RoutedEventArgs e) => PasswordInput.Focus();

    private void OnPasswordChanged(object sender, RoutedEventArgs e)
    {
        if (sender is PasswordBox box)
        {
            _viewModel.Password = box.Password;
        }
    }

    private void OnSignedIn(object? sender, EventArgs e)
    {
        Authenticated = true;
        DialogResult = true;
        Close();
    }
}
