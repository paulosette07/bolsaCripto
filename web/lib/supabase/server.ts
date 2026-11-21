import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

import { publicEnv } from '@/lib/env';
import type { Database } from '@/lib/types/database';

/**
 * Converte as opções de cookie do `@supabase/ssr` para o formato aceito por
 * `next/headers`. Feito campo a campo de propósito: `SerializeOptions` traz
 * `encode`, que é uma função e não existe no tipo `ResponseCookie` do Next.
 */
type NextSameSite = boolean | 'lax' | 'strict' | 'none';

interface NextCookieOptions {
  path: string;
  domain?: string;
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: NextSameSite;
}

function toNextCookieOptions(options: Record<string, unknown>): NextCookieOptions {
  const { sameSite } = options;

  return {
    path: typeof options.path === 'string' ? options.path : '/',
    domain: typeof options.domain === 'string' ? options.domain : undefined,
    maxAge: typeof options.maxAge === 'number' ? options.maxAge : undefined,
    expires: options.expires instanceof Date ? options.expires : undefined,
    httpOnly: typeof options.httpOnly === 'boolean' ? options.httpOnly : undefined,
    secure: typeof options.secure === 'boolean' ? options.secure : undefined,
    sameSite:
      sameSite === 'lax' || sameSite === 'strict' || sameSite === 'none' ? sameSite : undefined
  };
}

/**
 * Cliente Supabase para Server Components, Server Actions e Route Handlers.
 *
 * Crie um por request. Em Server Component o `setAll` falha silenciosamente
 * porque cookies são somente-leitura nesse contexto — a renovação de sessão
 * acontece no `proxy.ts`, que roda antes da renderização.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, toNextCookieOptions(options));
          }
        } catch {
          // Server Component: sem permissão de escrita. Ignorado de propósito.
        }
      }
    }
  });
}

/** Atalho: devolve o usuário autenticado ou `null`. */
export async function getCurrentUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return data.user;
}
