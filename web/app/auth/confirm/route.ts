import { NextResponse, type NextRequest } from 'next/server';

import { safeInternalPath } from '@/lib/auth/redirects';
import { createClient } from '@/lib/supabase/server';

/**
 * Destino do link de confirmação de e-mail.
 *
 * O template "Confirm signup" do Supabase precisa apontar para:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/painel
 *
 * Aqui o token_hash é trocado por uma sessão (verifyOtp). Sem esse passo o
 * usuário continua "não confirmado" e o login é recusado.
 */

const ALLOWED_OTP_TYPES = new Set([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email'
]);

type OtpType = 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const rawType = searchParams.get('type');
  const next = safeInternalPath(searchParams.get('next'));

  if (!tokenHash || !rawType || !ALLOWED_OTP_TYPES.has(rawType)) {
    return NextResponse.redirect(`${origin}/login?erro=link_invalido`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type: rawType as OtpType,
    token_hash: tokenHash
  });

  if (error) {
    return NextResponse.redirect(`${origin}/login?erro=link_expirado`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
