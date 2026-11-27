namespace BolsaMonitor.Core.Alerts;

/// <summary>
/// Executa uma rodada de verificação de alertas.
///
/// Existe como interface porque há duas implementações com a mesma assinatura e
/// significados diferentes:
///
///  - <see cref="AlertMonitor"/> — modo direto: o desktop cota, avalia e envia
///    o e-mail ele mesmo, com a credencial SMTP/Resend local;
///  - <c>ApiAlertRunner</c> — modo hospedado: o desktop só pede ao servidor que
///    faça o trabalho. Assim a release não carrega chave de e-mail nenhuma.
///
/// As telas conversam com esta interface, então a tela de alertas não sabe (nem
/// precisa saber) em qual modo o app está.
/// </summary>
public interface IAlertRunner
{
    Task<AlertRunSummary> RunOnceAsync(CancellationToken cancellationToken = default);
}
