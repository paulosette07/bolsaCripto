/**
 * Sanitização de destino pós-login.
 *
 * Impede open redirect via `?next=https://evil.com` e via `//evil.com` (que o
 * browser trata como protocol-relative). Usado pelas Server Actions e pelas
 * rotas que consomem o link de confirmação de e-mail.
 */

export const DEFAULT_POST_LOGIN_PATH = '/painel';

export function safeInternalPath(
  value: string | null | undefined,
  fallback: string = DEFAULT_POST_LOGIN_PATH
): string {
  const trimmed = value?.trim();

  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return fallback;
  }

  return trimmed;
}
