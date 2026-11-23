import { NextResponse, type NextRequest } from 'next/server';

import { safeInternalPath } from '@/lib/auth/redirects';
import { createClient } from '@/lib/supabase/server';

/**
 * Fallback para o template de e-mail padrão do Supabase, que redireciona com
 * `?code=...` (PKCE) em vez de `token_hash`.
 *
 * Suportar os dois caminhos evita a pegadinha clássica: o usuário clica no
 * e-mail, cai aqui, e o login falha porque a rota não existia.
 */

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = safeInternalPath(searchParams.get('next'));

  if (!code) {
    return NextResponse.redirect(`${origin}/login?erro=link_invalido`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?erro=link_expirado`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
