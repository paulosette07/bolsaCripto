import { NextResponse } from 'next/server';

import { searchAssets } from '@/lib/market';
import { toMarketErrorMessage } from '@/lib/market/http';
import { getCurrentUser } from '@/lib/supabase/server';

/**
 * GET /api/search?q=petro
 *
 * Busca unificada (B3 + cripto), usada pelo autocomplete do formulário de
 * carteira e do formulário de alerta.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim() ?? '';

  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await searchAssets(query);

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ error: toMarketErrorMessage(error) }, { status: 502 });
  }
}
