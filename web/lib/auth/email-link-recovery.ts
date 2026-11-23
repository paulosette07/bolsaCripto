import { safeInternalPath } from '@/lib/auth/redirects';

/**
 * Recuperação de links de confirmação que caem na raiz do site.
 *
 * Cenário real: o `emailRedirectTo` enviado no cadastro não está na lista de
 * *Redirect URLs* do projeto Supabase. O GoTrue então descarta a URL pedida e
 * redireciona para o *Site URL* puro, com o resultado na query string:
 *
 *   https://<site>/?code=<uuid>                   (fluxo PKCE, template padrão)
 *   https://<site>/?token_hash=<hash>&type=email   (template customizado)
 *
 * Sem tratar isso o usuário chega na home com a sessão pendente e nada
 * acontece. Aqui a query é traduzida para a rota interna que sabe trocar o
 * token por cookie de sessão.
 */

const HANDLER_PATHS = ['/auth/callback', '/auth/confirm'];

const ALLOWED_OTP_TYPES = new Set([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email'
]);

export const INVALID_LINK_PATH = '/login?erro=link_invalido';
export const EXPIRED_LINK_PATH = '/login?erro=link_expirado';

function isHandlerPath(pathname: string): boolean {
  return HANDLER_PATHS.some(
    (handler) => pathname === handler || pathname.startsWith(`${handler}/`)
  );
}

/**
 * Devolve o caminho interno para onde o request deve ser reenviado, ou `null`
 * quando não há nada a recuperar.
 */
export function recoverEmailLink(pathname: string, search: URLSearchParams): string | null {
  if (isHandlerPath(pathname)) {
    return null;
  }

  const errorCode = search.get('error_code') ?? search.get('error');

  if (errorCode) {
    return EXPIRED_LINK_PATH;
  }

  const next = safeInternalPath(search.get('next'));
  const tokenHash = search.get('token_hash');

  if (tokenHash) {
    const type = search.get('type') ?? '';

    if (!ALLOWED_OTP_TYPES.has(type)) {
      return INVALID_LINK_PATH;
    }

    const params = new URLSearchParams({ token_hash: tokenHash, type, next });

    return `/auth/confirm?${params.toString()}`;
  }

  const code = search.get('code');

  if (code) {
    const params = new URLSearchParams({ code, next });

    return `/auth/callback?${params.toString()}`;
  }

  return null;
}
