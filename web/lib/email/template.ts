import { formatCurrency, formatDateTime } from '@/lib/format';

import type { AlertEmailPayload } from './types';

/**
 * Template do e-mail de alerta.
 *
 * HTML de e-mail é uma selva: flexbox/grid não funcionam em Outlook, e Tailwind
 * não existe no cliente de e-mail. Por isso: tabelas + CSS inline.
 */

const COLORS = {
  canvas: '#121214',
  surface: '#18181B',
  line: '#27272A',
  ink: '#F4F4F5',
  inkMuted: '#A1A1AA',
  inkFaint: '#71717A',
  up: '#10B981',
  down: '#EF4444'
} as const;

interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function conditionLabel(payload: AlertEmailPayload): string {
  return payload.condition === 'above' ? 'subiu acima de' : 'caiu abaixo de';
}

export function renderAlertEmail(payload: AlertEmailPayload): RenderedEmail {
  const accent = payload.condition === 'above' ? COLORS.up : COLORS.down;
  const direction = payload.condition === 'above' ? 'Alta' : 'Baixa';
  const subject = `${payload.ticker} ${conditionLabel(payload)} ${formatCurrency(
    payload.targetPrice
  )} · Bolsa Monitor`;

  const assetLabel = payload.assetName
    ? `${payload.ticker} · ${payload.assetName}`
    : payload.ticker;
  const market = payload.assetType === 'crypto' ? 'Criptomoeda' : 'B3';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${COLORS.canvas};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="background-color:${COLORS.canvas};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="max-width:560px;background-color:${COLORS.surface};border:1px solid ${COLORS.line};border-radius:12px;">

            <!-- Cabeçalho -->
            <tr>
              <td style="padding:20px 24px;border-bottom:1px solid ${COLORS.line};">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="width:28px;height:28px;background-color:${COLORS.up};border-radius:8px;text-align:center;vertical-align:middle;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#04140E;">B</td>
                    <td style="padding-left:10px;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:${COLORS.ink};">
                      Bolsa Monitor
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Corpo -->
            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${accent};font-weight:bold;">
                  Alerta de ${direction.toLowerCase()}
                </p>

                <h1 style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:22px;line-height:1.25;color:${COLORS.ink};">
                  ${payload.ticker}
                </h1>
                <p style="margin:0 0 20px;font-family:Arial,sans-serif;font-size:13px;color:${COLORS.inkMuted};">
                  ${assetLabel} · ${market}
                </p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                  style="background-color:${COLORS.canvas};border:1px solid ${COLORS.line};border-radius:10px;">
                  <tr>
                    <td style="padding:16px 18px;">
                      <p style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:13px;line-height:1.5;color:${COLORS.ink};">
                        O preço <strong style="color:${accent};">${conditionLabel(payload)}</strong>
                        o seu preço-alvo de
                        <strong style="color:${COLORS.ink};">${formatCurrency(payload.targetPrice)}</strong>.
                      </p>

                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td style="padding-top:8px;font-family:Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:${COLORS.inkFaint};">
                            Preço no momento
                          </td>
                          <td align="right" style="padding-top:8px;font-family:Arial,sans-serif;font-size:18px;font-weight:bold;color:${COLORS.ink};">
                            ${formatCurrency(payload.currentPrice)}
                          </td>
                        </tr>
                        <tr>
                          <td style="padding-top:6px;font-family:Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:${COLORS.inkFaint};">
                            Preço-alvo
                          </td>
                          <td align="right" style="padding-top:6px;font-family:Arial,sans-serif;font-size:13px;color:${COLORS.inkMuted};">
                            ${formatCurrency(payload.targetPrice)}
                          </td>
                        </tr>
                        <tr>
                          <td style="padding-top:6px;font-family:Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:${COLORS.inkFaint};">
                            Verificado em
                          </td>
                          <td align="right" style="padding-top:6px;font-family:Arial,sans-serif;font-size:13px;color:${COLORS.inkMuted};">
                            ${formatDateTime(payload.triggeredAt.toISOString())}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>

                <p style="margin:20px 0 0;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:${COLORS.inkFaint};">
                  O alerta continua ativo. Para não encher sua caixa de entrada, ele só volta a
                  disparar depois do intervalo de silêncio configurado.
                </p>
              </td>
            </tr>

            <!-- Rodapé -->
            <tr>
              <td style="padding:16px 24px;border-top:1px solid ${COLORS.line};">
                <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;line-height:1.6;color:${COLORS.inkFaint};">
                  Você recebeu este e-mail porque configurou um alerta de preço no Bolsa Monitor.
                  Este aviso não é recomendação de investimento.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `Bolsa Monitor — alerta de ${direction.toLowerCase()}`,
    '',
    `${assetLabel} (${market})`,
    `O preço ${conditionLabel(payload)} o seu preço-alvo.`,
    '',
    `Preço no momento: ${formatCurrency(payload.currentPrice)}`,
    `Preço-alvo:       ${formatCurrency(payload.targetPrice)}`,
    `Verificado em:    ${formatDateTime(payload.triggeredAt.toISOString())}`,
    '',
    'O alerta continua ativo e volta a disparar após o intervalo de silêncio.',
    'Este aviso não é recomendação de investimento.'
  ].join('\n');

  return { subject, html, text };
}
