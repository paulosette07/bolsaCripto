import { NextResponse } from 'next/server';

import { runAlertCheck } from '@/lib/alerts/run';
import { getUserFromBearer, unauthorizedResponse } from '@/lib/auth/bearer';

/**
 * POST /api/app/alerts/check
 * Header: Authorization: Bearer <supabase access_token>
 * Saída:  { ok, alertsChecked, conditionsMet, emailsSent, emailsFailed, alertsWithoutQuote, errors }
 *
 * O app Windows não tem a chave do Resend/SMTP — e não deve ter. Em vez disso,
 * quando o usuário clica em *Verificar agora* (ou o timer de 5 min dispara), o
 * desktop pede para **este servidor** verificar os alertas daquela conta. O
 * e-mail sai pelo provedor configurado aqui.
 *
 * Duas travas de segurança:
 *  - `userId` vem do token, nunca do corpo, então ninguém verifica a conta
 *    alheia;
 *  - a rodada usa o mesmo *claim* atômico do cron, então desktop e cron não
 *    geram dois e-mails do mesmo alerta.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await getUserFromBearer(request);

  if (!user) {
    return unauthorizedResponse();
  }

  try {
    const summary = await runAlertCheck({ userId: user.id, sentVia: 'desktop' });

    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado.';

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
