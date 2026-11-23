import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { recoverEmailLink } from '@/lib/auth/email-link-recovery';
import { publicEnv } from '@/lib/env';

/**
 * Next 16 substituiu o arquivo `middleware.ts` por `proxy.ts`.
 *
 * Responsabilidades:
 *  1. renovar a sessão do Supabase a cada request (grava Set-Cookie na resposta);
 *  2. bloquear rotas privadas para visitantes;
 *  3. mandar usuário logado direto para o painel quando ele abre /login.
 *
 * A checagem aqui é só a primeira barreira: cada layout privado valida o
 * usuário de novo no servidor.
 */

const PROTECTED_ROUTES = ['/painel', '/mercado', '/carteira', '/alertas'];
const AUTH_ROUTES = ['/login', '/cadastro'];

function startsWithRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export async function proxy(request: NextRequest) {
  // Link de confirmação que caiu na raiz (Supabase descartou o redirectTo):
  // reencaminha antes de qualquer chamada ao GoTrue.
  const recoveredPath = recoverEmailLink(request.nextUrl.pathname, request.nextUrl.searchParams);

  if (recoveredPath) {
    const recoveryUrl = request.nextUrl.clone();
    const separatorIndex = recoveredPath.indexOf('?');
    const recoveredPathname =
      separatorIndex === -1 ? recoveredPath : recoveredPath.slice(0, separatorIndex);
    const recoveredQuery = separatorIndex === -1 ? '' : recoveredPath.slice(separatorIndex);

    recoveryUrl.pathname = recoveredPathname;
    recoveryUrl.search = recoveredQuery;

    return NextResponse.redirect(recoveryUrl);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        // Precisa ser recriado para propagar os cookies ao próximo handler.
        response = NextResponse.next({ request });

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }

        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      }
    }
  });

  // getUser valida o JWT contra o GoTrue; sem isso a sessão não renovaria.
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_ROUTES.some((route) => startsWithRoute(pathname, route));
  const isAuthRoute = AUTH_ROUTES.some((route) => startsWithRoute(pathname, route));

  if (isProtected && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.search = '';
    redirectUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (isAuthRoute && user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/painel';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export default proxy;

export const config = {
  matcher: [
    // Tudo, menos assets estáticos e imagens do Next.
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)'
  ]
};
