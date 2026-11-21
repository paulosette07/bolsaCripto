import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

import { runAlertCheck } from '@/lib/alerts/run';
import { cronSecret } from '@/lib/env';

/**
 * POST/GET /api/alerts/check
 *
 * Ponto único de disparo dos alertas, chamado por:
 *  - Cron da Vercel (`vercel.json`);
 *  - GitHub Actions a cada 5 min (plano Hobby da Vercel só permite cron diário);
 *  - o app desktop, se você quiser centralizar o envio no servidor.
 *
 * Autenticação: `Authorization: Bearer <CRON_SECRET>`. Sem CRON_SECRET
 * configurado a rota recusa tudo — nunca fica aberta por omissão.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BEARER_PREFIX = 'Bearer ';

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  // timingSafeEqual exige buffers do mesmo tamanho.
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function isAuthorized(request: Request): boolean {
  if (cronSecret.length === 0) {
    return false;
  }

  const header = request.headers.get('authorization');

  if (!header || !header.startsWith(BEARER_PREFIX)) {
    return false;
  }

  return safeEqual(header.slice(BEARER_PREFIX.length), cronSecret);
}

async function handleCheck(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const summary = await runAlertCheck();

    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado.';

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const GET = handleCheck;
export const POST = handleCheck;
