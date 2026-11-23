import { headers } from 'next/headers';

/**
 * Resolução do domínio público usado nos links enviados por e-mail
 * (confirmação de cadastro, recuperação de senha).
 *
 * Por que não usar só `NEXT_PUBLIC_SITE_URL`:
 *  - a variável é embutida em build-time; um deploy feito com o `.env.local`
 *    de desenvolvimento gera links para `localhost:3000` no e-mail do usuário;
 *  - o Supabase descarta `emailRedirectTo` quando a URL não está na lista de
 *    *Redirect URLs* do projeto e cai no *Site URL* do painel. Nesse cenário o
 *    app precisa saber o próprio domínio para reagir (ver `proxy.ts`).
 *
 * A ordem de precedência é: host da requisição → `NEXT_PUBLIC_SITE_URL` →
 * `localhost:3000` (apenas desenvolvimento).
 */

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);
const LOCAL_FALLBACK_ORIGIN = 'http://localhost:3000';
const DEFAULT_PROTOCOL = 'https';
const LOCAL_PROTOCOL = 'http';

/** Extrai o hostname de um header `Host` (trata IPv6 entre colchetes). */
function hostnameOf(host: string): string {
  const value = host.trim().toLowerCase();

  if (value.startsWith('[')) {
    const closingBracket = value.indexOf(']');

    return closingBracket === -1 ? value : value.slice(0, closingBracket + 1);
  }

  return value.split(':')[0] ?? value;
}

/** Normaliza qualquer entrada para `protocolo://host[:porta]`, sem barra final. */
export function normalizeOrigin(value: string | null | undefined): string | null {
  const trimmed = value?.trim().replace(/\/+$/, '');

  if (!trimmed) {
    return null;
  }

  const candidate = trimmed.includes('://') ? trimmed : `https://${trimmed}`;

  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
}

/**
 * Deriva a origem a partir dos headers do request.
 *
 * Na Vercel o `Host` já é o domínio real (inclusive domínio próprio) e o
 * `x-forwarded-proto` informa o protocolo; fora deles assumimos https, exceto
 * em endereços locais.
 */
export function originFromHeaders(
  readHeader: (name: string) => string | null | undefined
): string | null {
  const host = readHeader('x-forwarded-host') ?? readHeader('host');

  if (!host) {
    return null;
  }

  const isLocal = LOCAL_HOSTNAMES.has(hostnameOf(host));
  const forwardedProtocol = readHeader('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  const protocol =
    forwardedProtocol === 'http' || forwardedProtocol === 'https'
      ? forwardedProtocol
      : isLocal
        ? LOCAL_PROTOCOL
        : DEFAULT_PROTOCOL;

  return normalizeOrigin(`${protocol}://${host}`);
}

/** Origem do deploy atual. Use em Server Actions e Route Handlers. */
export async function resolveSiteOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const fromRequest = originFromHeaders((name) => requestHeaders.get(name));

  if (fromRequest) {
    return fromRequest;
  }

  return (
    normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL) ?? LOCAL_FALLBACK_ORIGIN
  );
}

/** Monta uma URL absoluta no domínio atual a partir de um caminho interno. */
export async function resolveSiteUrl(path: string): Promise<string> {
  const origin = await resolveSiteOrigin();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${origin}${normalizedPath}`;
}
