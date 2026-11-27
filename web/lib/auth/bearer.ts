import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { publicEnv } from '@/lib/env';

/**
 * Autenticação por `Authorization: Bearer <access_token>` do Supabase.
 *
 * O app Windows não tem cookies: ele guarda a sessão do próprio usuário e a
 * envia no header. Aqui o token é validado contra o GoTrue (mesma chave
 * publicável do navegador), sem service role e sem confiar no corpo do
 * request — um token inventado não passa.
 *
 * É isso que permite a release do desktop usar os dados de mercado deste
 * servidor sem embarcar nenhuma credencial de provider: quem chama é sempre um
 * usuário autenticado, identificado pelo `sub` do token.
 */

export interface BearerUser {
  id: string;
  email: string | null;
}

const BEARER_PREFIX = 'Bearer ';

export function readBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');

  if (!header || !header.startsWith(BEARER_PREFIX)) {
    return null;
  }

  const token = header.slice(BEARER_PREFIX.length).trim();

  return token.length > 0 ? token : null;
}

/**
 * Usuário dono do token, ou `null` quando o token falta, expirou ou é falso.
 *
 * Nunca lança: falha de rede com o GoTrue é tratada como "não autenticado",
 * que é o estado seguro.
 */
export async function getUserFromBearer(request: Request): Promise<BearerUser | null> {
  const token = readBearerToken(request);

  if (!token || publicEnv.supabaseUrl.length === 0 || publicEnv.supabaseAnonKey.length === 0) {
    return null;
  }

  try {
    const client = createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });

    const { data, error } = await client.auth.getUser(token);

    if (error || !data.user) {
      return null;
    }

    return { id: data.user.id, email: data.user.email ?? null };
  } catch {
    return null;
  }
}

/** Resposta padrão de rota protegida por token. */
export function unauthorizedResponse(): Response {
  return Response.json(
    { error: 'Não autenticado. Envie Authorization: Bearer <access_token>.' },
    { status: 401 }
  );
}
