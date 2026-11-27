import { NextResponse } from 'next/server';

import {
  MAX_ASSETS_PER_REQUEST,
  parseAssetRefs,
  parseRequestedCurrency,
  readJsonBody
} from '@/lib/app-api/parse';
import { getUserFromBearer, unauthorizedResponse } from '@/lib/auth/bearer';
import { getQuotes } from '@/lib/market';
import { getUsdBrlRate } from '@/lib/market/fx';
import { toMarketErrorMessage } from '@/lib/market/http';
import type { Currency } from '@/lib/market/types';
import { quotesForDisplay } from '@/lib/money';

/**
 * POST /api/app/quotes
 * Header: Authorization: Bearer <supabase access_token>
 * Body:   { assets: [{ ticker, assetType, cryptoId }], currency?: 'BRL' | 'USD' }
 * Saída:  { quotes: Quote[], currency: Currency }
 *
 * É a fonte de cotações da **release do app Windows**: ele não embarca token da
 * Brapi nem chave da CoinGecko, apenas conversa com este servidor usando a
 * sessão do próprio usuário. As credenciais dos providers ficam só aqui.
 *
 * Mesmas regras da web: ações/FIIs sempre em reais, cripto na moeda pedida.
 * Sem `currency` no corpo o padrão é real — não há cookie para consultar.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Câmbio só é necessário quando o pedido é em dólar. */
async function resolveMoney(
  currency: Currency | null
): Promise<{ currency: Currency; usdBrl: number | null }> {
  if (currency !== 'USD') {
    return { currency: 'BRL', usdBrl: null };
  }

  const fx = await getUsdBrlRate().catch(() => null);

  return { currency, usdBrl: fx?.rate ?? null };
}

export async function POST(request: Request) {
  const user = await getUserFromBearer(request);

  if (!user) {
    return unauthorizedResponse();
  }

  const payload = await readJsonBody(request);
  const assets = parseAssetRefs(payload);

  if (!assets) {
    return NextResponse.json(
      {
        error: `Envie { assets: [{ ticker, assetType, cryptoId }] } com até ${MAX_ASSETS_PER_REQUEST} ativos.`
      },
      { status: 400 }
    );
  }

  try {
    const money = await resolveMoney(parseRequestedCurrency(payload));
    const raw = await getQuotes(assets, { currency: money.currency });

    return NextResponse.json({
      quotes: quotesForDisplay(raw, money.currency, money.usdBrl),
      currency: money.currency
    });
  } catch (error) {
    return NextResponse.json({ error: toMarketErrorMessage(error) }, { status: 502 });
  }
}
