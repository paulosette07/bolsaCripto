import { NextResponse } from 'next/server';

import { getUserFromBearer, unauthorizedResponse } from '@/lib/auth/bearer';
import { getMacroQuotes } from '@/lib/market/macro';
import { getMacroRates } from '@/lib/market/rates';

/**
 * GET /api/app/macro
 * Header: Authorization: Bearer <supabase access_token>
 * Saída:  { quotes: MacroQuote[], rates: MacroRate[] }
 *
 * Indicadores do painel (dólar, euro, ouro, Ibovespa, Selic e IPCA) para o app
 * Windows. Falha de um bloco não zera o outro: cada lista volta como vier, e a
 * tela decide o que mostrar.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await getUserFromBearer(request);

  if (!user) {
    return unauthorizedResponse();
  }

  const [quotes, rates] = await Promise.all([
    getMacroQuotes().catch(() => []),
    getMacroRates().catch(() => [])
  ]);

  return NextResponse.json({ quotes, rates });
}
