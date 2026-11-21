import { NextResponse } from 'next/server';

import { getHistory } from '@/lib/market';
import { toMarketErrorMessage } from '@/lib/market/http';
import { isAssetType, isMarketRange, parseCurrency } from '@/lib/market/types';
import { getCurrentUser } from '@/lib/supabase/server';

/**
 * GET /api/history?ticker=PETR4&type=stock&range=1mo&cryptoId=bitcoin&currency=usd
 *
 * `cryptoId` é opcional: quando ausente, a fachada resolve o id a partir do
 * ticker (mapa local + busca na CoinGecko).
 *
 * `currency` só tem efeito em cripto; ativos da B3 voltam sempre em BRL.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
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
