import { NextResponse } from 'next/server';

import { getMacroQuotes } from '@/lib/market/macro';
import { getMacroRates } from '@/lib/market/rates';
import { getCurrentUser } from '@/lib/supabase/server';

/**
 * GET /api/macro
 * Resposta: { quotes: MacroQuote[], rates: MacroRate[] }
 *
 * Usado pelo painel (server side) e disponível para clientes externos
 * acompanharem dólar, euro, ouro, Ibovespa, Selic e IPCA de uma vez.
 * Falha de um bloco não zera o outro: cada lista volta como vier.
 */
export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const [quotes, rates] = await Promise.all([
    getMacroQuotes().catch(() => []),
    getMacroRates().catch(() => [])
  ]);

  if (quotes.length === 0 && rates.length === 0) {
    return NextResponse.json(
      { error: 'Não foi possível consultar os indicadores agora.' },
      { status: 502 }
    );
  }

  return NextResponse.json({ quotes, rates });
}
