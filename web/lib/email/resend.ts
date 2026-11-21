import 'server-only';

import { Resend } from 'resend';

import { requireServerEnv } from '@/lib/env';

import { renderAlertEmail } from './template';
import type { AlertEmailPayload, SendEmailResult } from './types';

/**
 * Provedor Resend.
 *
 * Pegadinha do plano gratuito: sem domínio verificado, o Resend só entrega para
 * o e-mail do dono da conta, e o remetente precisa ser `onboarding@resend.dev`.
 * Para alertar usuários quaisquer, verifique um domínio em resend.com/domains
 * ou use o provedor SMTP.
 */
export async function sendWithResend(payload: AlertEmailPayload): Promise<SendEmailResult> {
  const apiKey = requireServerEnv('RESEND_API_KEY');
  const from = process.env.RESEND_FROM?.trim() || 'Bolsa Monitor <onboarding@resend.dev>';

  const resend = new Resend(apiKey);
  const { subject, html, text } = renderAlertEmail(payload);

  const { data, error } = await resend.emails.send({
    from,
    to: payload.to,
    subject,
    html,
    text
  });

  if (error) {
    throw new Error(`Resend recusou o envio: ${error.message}`);
  }

  return { provider: 'resend', messageId: data?.id ?? null };
}
