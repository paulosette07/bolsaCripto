import { NextResponse } from 'next/server';

import { getUserFromBearer, unauthorizedResponse } from '@/lib/auth/bearer';
import { getHistory } from '@/lib/market';
import { toMarketErrorMessage } from '@/lib/market/http';
import { isAssetType, isMarketRange, parseCurrency } from '@/lib/market/types';

/**
 * GET /api/app/history?ticker=PETR4&type=stock&range=1mo&cryptoId=bitcoin&currency=USD
 * Header: Authorization: Bearer <supabase access_token>
 * Saída: PriceHistory — { ticker, assetType, cryptoId, currency, points[] }
 *
 * Mesmo contrato de `/api/history`, com autenticação por token em vez de
 * cookie, para o app Windows montar o gráfico sem falar com o Yahoo/Brapi.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await getUserFromBearer(request);

  if (!user) {
    return unauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker')?.trim().toUpperCase() ?? '';
  const type = searchParams.get('type');
  const range = searchParams.get('range') ?? '1mo';
  const cryptoId = searchParams.get('cryptoId');
  const currency = parseCurrency(searchParams.get('currency'));

  if (ticker.length === 0) {
    return NextResponse.json({ error: 'Parâmetro "ticker" é obrigatório.' }, { status: 400 });
  }

  if (!isAssetType(type)) {
    return NextResponse.json(
      { error: 'Parâmetro "type" deve ser "stock" ou "crypto".' },
      { status: 400 }
    );
  }

  if (!isMarketRange(range)) {
    return NextResponse.json(
      { error: 'Parâmetro "range" inválido. Use 1d, 5d, 1mo, 3mo, 6mo, 1y ou max.' },
      { status: 400 }
    );
  }

  try {
    const history = await getHistory(
      {
        ticker,
        assetType: type,
        cryptoId: cryptoId && cryptoId.length > 0 ? cryptoId : null
      },
      range,
      { currency }
    );

    return NextResponse.json(history);
  } catch (error) {
    return NextResponse.json({ error: toMarketErrorMessage(error) }, { status: 502 });
  }
}
