using System.Net;

using BolsaMonitor.Core.Formatting;
using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Core.Email;

/// <summary>
/// Monta o e-mail de alerta.
///
/// O HTML usa tabela + estilo inline porque clientes de e-mail (Outlook,
/// Gmail) descartam folhas de estilo externas. Textos de terceiros passam por
/// `WebUtility.HtmlEncode` — a API de codificação do próprio .NET.
/// </summary>
public static class AlertEmailBuilder
{
    public static EmailMessage Build(string to, PriceAlertRow alert, decimal currentPrice, string? userName = null)
    {
        var ticker = Encode(alert.Ticker.ToUpperInvariant());
        var isAbove = string.Equals(alert.Condition, "above", StringComparison.OrdinalIgnoreCase);
        var target = BrlFormat.Price(alert.TargetPrice);
        var price = BrlFormat.Price(currentPrice);
        var greeting = string.IsNullOrWhiteSpace(userName) ? "Olá" : $"Olá, {Encode(userName!)}";
        var conditionText = isAbove ? "subiu acima de" : "caiu abaixo de";
        var accent = isAbove ? "#10B981" : "#EF4444";
        var arrow = isAbove ? "▲" : "▼";
        var when = BrlFormat.DateTime(DateTimeOffset.UtcNow);

        var subject = $"{alert.Ticker.ToUpperInvariant()} {conditionText} {target}";

        var html = $"""
            <!DOCTYPE html>
            <html lang="pt-BR">
              <body style="margin:0;padding:24px 12px;background:#0A0C0B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#121614;border:1px solid #22302A;border-radius:14px;overflow:hidden;">
                  <tr>
                    <td style="padding:22px 26px 18px 26px;border-bottom:1px solid #22302A;">
                      <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#7C8A83;">Bolsa Monitor</div>
                      <div style="margin-top:6px;font-size:15px;color:#E7EFEA;">{greeting}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:24px 26px 8px 26px;">
                      <div style="font-size:12px;color:#7C8A83;letter-spacing:.04em;text-transform:uppercase;">Alerta de preço</div>
                      <h1 style="margin:8px 0 0 0;font-size:26px;line-height:1.2;color:#E7EFEA;font-weight:600;">{ticker}</h1>
                      <p style="margin:10px 0 0 0;font-size:14px;line-height:1.6;color:#A9B8B1;">
                        O ativo {conditionText} <strong style="color:#E7EFEA;">{target}</strong> e está cotado a
                        <strong style="color:{accent};">{price}</strong>.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:16px 26px 0 26px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0F1311;border:1px solid #22302A;border-radius:10px;">
                        <tr>
                          <td style="padding:14px 16px;font-size:12px;color:#7C8A83;">Condição</td>
                          <td align="right" style="padding:14px 16px;font-size:13px;color:#E7EFEA;">
                            <span style="color:{accent};font-weight:600;">{arrow}</span>
                            {target}
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:0 16px 14px 16px;font-size:12px;color:#7C8A83;">Cotação no aviso</td>
                          <td align="right" style="padding:0 16px 14px 16px;font-size:13px;color:#E7EFEA;">{price}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:20px 26px 26px 26px;">
                      <p style="margin:0;font-size:11px;line-height:1.6;color:#6C7A74;">
                        Enviado em {when}. Você recebe no máximo um aviso a cada {alert.CooldownMinutes} minutos
                        para este alerta. Ajuste ou pause em Alertas → no app.
                      </p>
                    </td>
                  </tr>
                </table>
              </body>
            </html>
            """;

        var text = $"""
            {greeting}

            Alerta de preço — {alert.Ticker.ToUpperInvariant()}
            O ativo {conditionText} {target} e está cotado a {price}.

            Condição: {target}
            Cotação no aviso: {price}
            Enviado em {when}
            Intervalo entre avisos: {alert.CooldownMinutes} minutos

            Bolsa Monitor — dados por Brapi e CoinGecko.
            """;

        return new EmailMessage(to, subject, html, text);
    }

    private static string Encode(string value) => WebUtility.HtmlEncode(value);
}
