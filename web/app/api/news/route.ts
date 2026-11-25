import { NextResponse } from 'next/server';

import { getNews, getNewsBoard } from '@/lib/news';
import { isNewsScope } from '@/lib/news/types';
import { getCurrentUser } from '@/lib/supabase/server';

/**
 * GET /api/news?scope=brasil&limit=6
 *
 * Sem `scope`, devolve os três recortes de uma vez (`board`). Com `scope`,
 * devolve só aquele recorte em `items`. `limit` é limitado a 20 para não
 * transformar o painel em leitor de feed completo.
 */

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
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope');
  const limit = parseLimit(searchParams.get('limit'));

  if (scope !== null && !isNewsScope(scope)) {
    return NextResponse.json(
      { error: 'Parâmetro "scope" deve ser brasil, economia ou mundo.' },
      { status: 400 }
    );
  }

  try {
    if (isNewsScope(scope)) {
      return NextResponse.json({ items: await getNews(scope, limit) });
    }

    return NextResponse.json({ board: await getNewsBoard(limit) });
  } catch {
    return NextResponse.json(
      { error: 'Não foi possível carregar as notícias agora.' },
      { status: 502 }
    );
  }
}
