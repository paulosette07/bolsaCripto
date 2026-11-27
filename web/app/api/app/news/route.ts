import { NextResponse } from 'next/server';

import { getUserFromBearer, unauthorizedResponse } from '@/lib/auth/bearer';
import { getNews } from '@/lib/news';
import { isNewsScope } from '@/lib/news/types';

/**
 * GET /api/app/news?scope=brasil&limit=6
 * Header: Authorization: Bearer <supabase access_token>
 * Saída:  { items: NewsItem[] }
 *
 * Manchetes de um recorte para o painel do app Windows. O desktop carrega os
 * três recortes (Brasil, economia, mundo) em paralelo, como a tela web faz.
 * Lista vazia significa "nada disponível agora", nunca erro de tela.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 20;

function parseLimit(value: string | null): number {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
}

export async function GET(request: Request) {
  const user = await getUserFromBearer(request);

  if (!user) {
    return unauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope') ?? 'brasil';
  const limit = parseLimit(searchParams.get('limit'));

  if (!isNewsScope(scope)) {
    return NextResponse.json(
      { error: 'Parâmetro "scope" deve ser brasil, economia ou mundo.' },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json({ items: await getNews(scope, limit) });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
