/**
 * Tradução das mensagens de erro do Supabase Auth.
 *
 * Sem isso, o usuário recebe "Invalid login credentials" no meio de uma
 * interface em português. A lista cobre os casos que realmente acontecem;
 * o que não estiver aqui cai numa mensagem genérica.
 */

const MESSAGE_MAP: readonly { match: RegExp; message: string }[] = [
  {
    match: /invalid login credentials/i,
    message: 'E-mail ou senha incorretos.'
  },
  {
    match: /email not confirmed/i,
    message: 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.'
  },
  {
    match: /user already registered|already been registered/i,
    message: 'Este e-mail já está cadastrado. Tente entrar.'
  },
  {
    match: /password should be at least (\d+)/i,
    message: 'A senha é curta demais. Use no mínimo 8 caracteres.'
  },
  {
    match: /unable to validate email address|invalid email/i,
    message: 'E-mail inválido. Confira o endereço digitado.'
  },
  {
    match: /email rate limit exceeded|over_email_send_rate_limit/i,
    message:
      'Muitos e-mails enviados em pouco tempo. Aguarde alguns minutos e tente novamente.'
  },
  {
    match: /for security purposes, you can only request this after (\d+)/i,
    message: 'Por segurança, aguarde alguns segundos antes de tentar de novo.'
  },
  {
    match: /token has expired|invalid token|otp_expired/i,
    message: 'O link expirou ou já foi usado. Solicite um novo e-mail de confirmação.'
  },
  {
    match: /signups not allowed|signup is disabled/i,
    message: 'O cadastro está desativado neste projeto.'
  },
  {
    match: /password should contain|weak password/i,
    message: 'Senha fraca. Use letras, números e no mínimo 8 caracteres.'
  }
];

const GENERIC_MESSAGE = 'Não foi possível concluir a operação. Tente novamente.';

export function translateAuthError(message: string | null | undefined): string {
  if (!message) {
    return GENERIC_MESSAGE;
  }

  for (const entry of MESSAGE_MAP) {
    if (entry.match.test(message)) {
      return entry.message;
    }
  }

  return GENERIC_MESSAGE;
}
