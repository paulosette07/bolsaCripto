import 'server-only';

import { emailProvider } from '@/lib/env';

import { sendWithResend } from './resend';
import { sendWithSmtp } from './smtp';
import type { AlertEmailPayload, SendEmailFn } from './types';

export { renderAlertEmail } from './template';
export type { AlertEmailPayload, SendEmailResult, SendEmailFn } from './types';

/**
 * Escolhe o provedor de e-mail a partir de `EMAIL_PROVIDER`.
 *
 * O fallback existe para o caso comum de esquecer a variável: se `resend` está
 * selecionado mas só há credencial SMTP, usa SMTP (e vice-versa). Melhor enviar
 * pelo canal errado do que não enviar o alerta.
 */
export function getEmailSender(): SendEmailFn {
  const requested = emailProvider;

  const hasResend = Boolean(process.env.RESEND_API_KEY);
  const hasSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

  if (requested === 'smtp') {
    if (hasSmtp) {
      return (payload: AlertEmailPayload) => sendWithSmtp(payload);
    }

    if (hasResend) {
      return (payload: AlertEmailPayload) => sendWithResend(payload);
    }
  }

  if (requested === 'resend') {
    if (hasResend) {
      return (payload: AlertEmailPayload) => sendWithResend(payload);
    }

    if (hasSmtp) {
      return (payload: AlertEmailPayload) => sendWithSmtp(payload);
    }
  }

  throw new Error(
    'Nenhum provedor de e-mail configurado. Defina RESEND_API_KEY ou o trio SMTP_HOST/SMTP_USER/SMTP_PASS em .env.local.'
  );
}

/** `true` quando existe credencial suficiente para tentar enviar. */
export function isEmailConfigured(): boolean {
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  const hasSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

  return hasResend || hasSmtp;
}
