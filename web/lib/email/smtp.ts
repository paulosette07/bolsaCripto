import 'server-only';

import nodemailer from 'nodemailer';

import { renderAlertEmail } from './template';
import type { AlertEmailPayload, SendEmailResult } from './types';

/**
 * Provedor SMTP (Nodemailer).
 *
 * Funciona com Gmail usando "senha de app" — sem domínio próprio e podendo
 * entregar para qualquer destinatário desde o primeiro dia. É o caminho mais
 * curto para um app pessoal sair do papel.
 *
 * Requer runtime Node (não roda no Edge).
 */
function readPort(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function sendWithSmtp(payload: AlertEmailPayload): Promise<SendEmailResult> {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      'SMTP não configurado. Defina SMTP_HOST, SMTP_USER e SMTP_PASS (Gmail exige senha de app).'
    );
  }

  const port = readPort(process.env.SMTP_PORT, 587);
  const secure = (process.env.SMTP_SECURE ?? 'false').toLowerCase() === 'true';
  const from = process.env.SMTP_FROM?.trim() || `Bolsa Monitor <${user}>`;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });

  const { subject, html, text } = renderAlertEmail(payload);

  const info = await transporter.sendMail({
    from,
    to: payload.to,
    subject,
    html,
    text
  });

  return { provider: 'smtp', messageId: info.messageId ?? null };
}
