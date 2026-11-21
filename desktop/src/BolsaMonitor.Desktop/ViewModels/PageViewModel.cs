using System.Net.Http;

using CommunityToolkit.Mvvm.ComponentModel;

namespace BolsaMonitor.Desktop.ViewModels;

/// <summary>
/// Base das páginas navegáveis. Cada página carrega seus próprios dados ao ser
/// exibida — nada de carregar tudo no login e ficar com dados velhos.
/// </summary>
public abstract partial class PageViewModel : ObservableObject
{
    [ObservableProperty]
    private bool _isBusy;

    [ObservableProperty]
    private string? _errorMessage;

    public abstract string Title { get; }

    public abstract string Subtitle { get; }

    /// <summary>Carrega (ou recarrega) os dados da página.</summary>
    public abstract Task LoadAsync(CancellationToken cancellationToken = default);

    /// <summary>Executa uma tarefa controlando `IsBusy` e traduzindo exceções em mensagem.</summary>
    protected async Task RunGuardedAsync(Func<Task> action)
    {
        if (IsBusy)
        {
            return;
        }

        IsBusy = true;
        ErrorMessage = null;

        try
        {
            await action().ConfigureAwait(true);
        }
        catch (Exception exception)
        {
            ErrorMessage = DescribeFailure(exception);
        }
        finally
        {
            IsBusy = false;
        }
    }

    /// <summary>
    /// Mensagens de mercado já vêm prontas para o usuário; o resto recebe um
    /// texto genérico com o motivo, para não mostrar stack trace.
    /// </summary>
    private static string DescribeFailure(Exception exception) => exception switch
    {
        BolsaMonitor.Core.Market.MarketDataException market => market.Message,
        InvalidOperationException invalid => invalid.Message,
        HttpRequestException => "Falha de conexão. Verifique sua internet.",
        TaskCanceledException => "A consulta demorou demais. Tente novamente.",
        _ => $"Algo deu errado: {exception.Message}"
    };
}
