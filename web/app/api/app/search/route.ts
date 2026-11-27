import { NextResponse } from 'next/server';

import { getUserFromBearer, unauthorizedResponse } from '@/lib/auth/bearer';
import { searchAssets } from '@/lib/market';

/**
 * GET /api/app/search?q=petr
 * Header: Authorization: Bearer <supabase access_token>
 * Saída:  { results: AssetSearchResult[] }
 *
 * Busca unificada (B3 + cripto) para o autocomplete do app Windows. Erros de
 * provider viram lista vazia: busca é conveniência, o usuário pode digitar o
 * ticker direto.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await getUserFromBearer(request);

  if (!user) {
    return unauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim() ?? '';

  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    return NextResponse.json({ results: await searchAssets(query) });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
