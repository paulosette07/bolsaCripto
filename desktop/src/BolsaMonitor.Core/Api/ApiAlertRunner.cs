using BolsaMonitor.Core.Alerts;

namespace BolsaMonitor.Core.Api;

/// <summary>
/// Rodada de alertas no **modo hospedado**: o desktop pede e o servidor faz.
///
/// É por causa disto que a release pode ser distribuída sem chave de e-mail. O
/// servidor usa a mesma rotina do cron (`runAlertCheck`), cuja reivindicação
/// atômica de `last_notified_at` impede que desktop e cron mandem o mesmo aviso
/// duas vezes — mesmo que os dois rodem no mesmo minuto.
/// </summary>
public sealed class ApiAlertRunner : IAlertRunner
{
    private const string AlertsCheckPath = "/api/app/alerts/check";

    /// <summary>O endpoint não recebe parâmetros: o usuário vem do token.</summary>
    private const string EmptyBody = "{}";

    private readonly ApiClient _client;

    public ApiAlertRunner(ApiClient client)
    {
        _client = client;
    }

    public async Task<AlertRunSummary> RunOnceAsync(CancellationToken cancellationToken = default)
    {
        var json = await _client
            .PostAsync(AlertsCheckPath, EmptyBody, cancellationToken)
            .ConfigureAwait(false);

        // O parser valida `ok` e traduz o erro do servidor em mensagem de tela.
        return ApiJson.ParseAlertCheck(json);
    }
}
