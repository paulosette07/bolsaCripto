import { NextResponse } from 'next/server';

import { getUsdBrlRate } from '@/lib/market/fx';
import { toFxSnapshot } from '@/lib/market/fx-snapshot';

/**
 * GET /api/fx
 * Resposta: { rate, changePercent, referenceDate, source, fetchedAt }
 *
 * Público de propósito: é a cotação do dólar comercial, dado de mercado que
 * qualquer cliente (a faixa fixa do topo, o app Windows antes mesmo do login)
 * precisa para exibir o número. Nada de dado de usuário aqui.
 *
 * Cadência de 5 minutos, a mesma do refresh das telas: o route é cacheado por
 * `revalidate` e a chamada ao BCB usa o mesmo TTL, então um pico de acessos não
 * vira uma rajada de requisições ao Banco Central.
 *
 * Falha das duas fontes responde 200 com `rate: null` — o cliente mostra "—"
 * em vez de tratar como erro de tela.
 */

export const revalidate = 240;

export async function GET() {
  const snapshot = toFxSnapshot(await getUsdBrlRate());

  return NextResponse.json(snapshot, {
    headers: {
      // CDN da Vercel: 4 min de cache fresco, 5 min tolerando conteúdo velho
      // enquanto a revalidação acontece em background.
      'cache-control': 'public, max-age=60, s-maxage=240, stale-while-revalidate=300'
    }
  });
}
