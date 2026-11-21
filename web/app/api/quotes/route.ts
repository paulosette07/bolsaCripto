import { NextResponse } from 'next/server';

import { getQuotes } from '@/lib/market';
import { isAssetType } from '@/lib/market/types';
import type { AssetRef } from '@/lib/market/types';
import { toMarketErrorMessage } from '@/lib/market/http';
import { getCurrentUser } from '@/lib/supabase/server';

/**
 * POST /api/quotes
 * Body: { assets: [{ ticker, assetType, cryptoId }] }
 * Resposta: { quotes: Quote[] }
 *
 * POST (e não GET) porque o mesmo ticker existe nos dois mercados: `BTC` como
 * cripto e um eventual `BTC` como código de bolsa. O corpo deixa o tipo
 * explícito sem inventar sintaxe na query string.
 */

const MAX_ASSETS_PER_REQUEST = 60;

function parseAssets(payload: unknown): AssetRef[] | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { assets } = payload as { assets?: unknown };

  if (!Array.isArray(assets) || assets.length === 0 || assets.length > MAX_ASSETS_PER_REQUEST) {
    return null;
  }

  const parsed: AssetRef[] = [];

  for (const entry of assets) {
    if (typeof entry !== 'object' || entry === null) {
      return null;
    }

    const { ticker, assetType, cryptoId } = entry as {
      ticker?: unknown;
      assetType?: unknown;
      cryptoId?: unknown;
    };

    if (typeof ticker !== 'string' || ticker.trim().length === 0) {
      return null;
    }

    if (!isAssetType(assetType)) {
      return null;
    }

    parsed.push({
      ticker: ticker.trim().toUpperCase(),
      assetType,
      cryptoId: typeof cryptoId === 'string' && cryptoId.length > 0 ? cryptoId : null
    });
  }

  return parsed;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido no corpo da requisição.' }, { status: 400 });
  }

  const assets = parseAssets(payload);

  if (!assets) {
    return NextResponse.json(
      {
        error: `Envie { assets: [{ ticker, assetType, cryptoId }] } com até ${MAX_ASSETS_PER_REQUEST} ativos.`
      },
      { status: 400 }
    );
  }

  try {
    const quotes = await getQuotes(assets);

    return NextResponse.json({ quotes });
  } catch (error) {
    return NextResponse.json({ error: toMarketErrorMessage(error) }, { status: 502 });
  }
}
