import 'server-only';

import { getQuotes } from '@/lib/market';
import { toMarketErrorMessage } from '@/lib/market/http';
import type { AssetRef } from '@/lib/market/types';
import { getEmailSender, isEmailConfigured } from '@/lib/email';
import type { AlertCondition } from '@/lib/types/database';
import { toNumber } from '@/lib/format';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Motor de verificação de alertas.
 *
 * Usado por dois clientes independentes — o cron da Vercel e o app desktop —
 * por isso é idempotente e concorrente-seguro:
 *
 *  1. lê os alertas ativos;
 *  2. busca preço atual de cada ativo (sem cache);
 *  3. para cada alerta cuja condição foi atingida, tenta o "claim" atômico:
 *     um UPDATE condicional em `last_notified_at`. Só quem consegue atualizar
 *     a linha envia o e-mail. Se o cron e o desktop rodarem no mesmo segundo,
 *     apenas um deles notifica.
 *  4. registra o disparo em `alert_events` (sucesso ou falha).
 *  5. se o envio falhar, devolve `last_notified_at` ao valor anterior para que
 *     a próxima execução tente de novo — não se perde alerta por erro de SMTP.
 */

export interface AlertRunSummary {
  alertsChecked: number;
  conditionsMet: number;
  emailsSent: number;
  emailsFailed: number;
  alertsWithoutQuote: number;
  errors: string[];
}

export function isConditionMet(
  condition: AlertCondition,
  targetPrice: number,
  currentPrice: number
): boolean {
  return condition === 'above' ? currentPrice >= targetPrice : currentPrice <= targetPrice;
}

interface AlertRecord {
  id: string;
  user_id: string;
  ticker: string;
  asset_type: 'stock' | 'crypto';
  crypto_id: string | null;
  condition: AlertCondition;
  target_price: string;
  cooldown_minutes: number;
  last_notified_at: string | null;
}

interface ProfileRecord {
  id: string;
  email: string;
  full_name: string | null;
}

const MAX_ERRORS_REPORTED = 20;

export async function runAlertCheck(): Promise<AlertRunSummary> {
  const summary: AlertRunSummary = {
    alertsChecked: 0,
    conditionsMet: 0,
    emailsSent: 0,
    emailsFailed: 0,
    alertsWithoutQuote: 0,
    errors: []
  };

  const supabase = createAdminClient();

  const { data: alerts, error: alertsError } = await supabase
    .from('price_alerts')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(500);

  if (alertsError) {
    summary.errors.push(`Falha ao ler alertas: ${alertsError.message}`);
    return summary;
  }

  const alertList = (alerts ?? []) as AlertRecord[];
  summary.alertsChecked = alertList.length;

  if (alertList.length === 0) {
    return summary;
  }

  // Emails dos donos dos alertas (uma query só).
  const userIds = [...new Set(alertList.map((alert) => alert.user_id))];
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .in('id', userIds);

  if (profilesError) {
    summary.errors.push(`Falha ao ler perfis: ${profilesError.message}`);
    return summary;
  }

  const emailByUserId = new Map<string, string>();
  const nameByUserId = new Map<string, string | null>();

  for (const profile of (profiles ?? []) as ProfileRecord[]) {
    emailByUserId.set(profile.id, profile.email);
    nameByUserId.set(profile.id, profile.full_name);
  }

  // Um único lote de cotações para todos os ativos monitorados.
  const assetRefs: AssetRef[] = alertList.map((alert) => ({
    ticker: alert.ticker,
    assetType: alert.asset_type,
    cryptoId: alert.crypto_id
  }));

  let quotes: Awaited<ReturnType<typeof getQuotes>> = [];

  try {
    quotes = await getQuotes(assetRefs, { noStore: true });
  } catch (error) {
    summary.errors.push(`Falha ao buscar cotações: ${toMarketErrorMessage(error)}`);
    return summary;
  }

  const priceByKey = new Map<string, { price: number; name: string }>();

  for (const quote of quotes) {
    priceByKey.set(`${quote.assetType}:${quote.ticker.toUpperCase()}`, {
      price: quote.price,
      name: quote.name
    });
  }

  const sender = isEmailConfigured() ? getEmailSender() : null;

  for (const alert of alertList) {
    const key = `${alert.asset_type}:${alert.ticker.toUpperCase()}`;
    const quote = priceByKey.get(key);

    if (!quote) {
      summary.alertsWithoutQuote += 1;
      continue;
    }

    const targetPrice = toNumber(alert.target_price) ?? 0;
    const conditionMet = isConditionMet(alert.condition, targetPrice, quote.price);

    // Sempre registra o último preço observado (útil na tela de alertas).
    if (!conditionMet) {
      await supabase
        .from('price_alerts')
        .update({ last_checked_price: quote.price })
        .eq('id', alert.id);

      continue;
    }

    summary.conditionsMet += 1;

    const cutoff = new Date(
      Date.now() - alert.cooldown_minutes * 60_000
    ).toISOString();

    // Claim atômico: só a linha que mudou segue para o envio.
    const { data: claimed, error: claimError } = await supabase
      .from('price_alerts')
      .update({
        last_notified_at: new Date().toISOString(),
        last_checked_price: quote.price
      })
      .eq('id', alert.id)
      .eq('is_active', true)
      .or(`last_notified_at.is.null,last_notified_at.lt.${cutoff}`)
      .select('id');

    if (claimError) {
      summary.errors.push(`Claim falhou para ${alert.ticker}: ${claimError.message}`);
      continue;
    }

    if (!claimed || claimed.length === 0) {
      // Outro processo já notificou dentro da janela de silêncio.
      continue;
    }

    const recipient = emailByUserId.get(alert.user_id);

    if (!recipient || !sender) {
      summary.emailsFailed += 1;

      const reason = !recipient
        ? 'Perfil sem e-mail cadastrado.'
        : 'Nenhum provedor de e-mail configurado no servidor.';

      if (summary.errors.length < MAX_ERRORS_REPORTED) {
        summary.errors.push(`${alert.ticker}: ${reason}`);
      }

      await supabase.from('alert_events').insert({
        alert_id: alert.id,
        user_id: alert.user_id,
        ticker: alert.ticker,
        asset_type: alert.asset_type,
        condition: alert.condition,
        target_price: targetPrice,
        price_at_trigger: quote.price,
        sent_via: 'cron',
        provider: null,
        status: 'failed',
        error_message: reason
      });

      // Devolve a janela: sem e-mail, o alerta não deve ficar "gasto".
      await supabase
        .from('price_alerts')
        .update({ last_notified_at: alert.last_notified_at })
        .eq('id', alert.id);

      continue;
    }

    try {
      const result = await sender({
        to: recipient,
        ticker: alert.ticker,
        assetName: quote.name,
        assetType: alert.asset_type,
        condition: alert.condition,
        targetPrice,
        currentPrice: quote.price,
        triggeredAt: new Date()
      });

      summary.emailsSent += 1;

      await supabase.from('alert_events').insert({
        alert_id: alert.id,
        user_id: alert.user_id,
        ticker: alert.ticker,
        asset_type: alert.asset_type,
        condition: alert.condition,
        target_price: targetPrice,
        price_at_trigger: quote.price,
        sent_via: 'cron',
        provider: result.provider,
        status: 'sent',
        error_message: null
      });
    } catch (error) {
      summary.emailsFailed += 1;

      const message = error instanceof Error ? error.message : 'Erro desconhecido no envio.';

      if (summary.errors.length < MAX_ERRORS_REPORTED) {
        summary.errors.push(`${alert.ticker}: ${message}`);
      }

      await supabase.from('alert_events').insert({
        alert_id: alert.id,
        user_id: alert.user_id,
        ticker: alert.ticker,
        asset_type: alert.asset_type,
        condition: alert.condition,
        target_price: targetPrice,
        price_at_trigger: quote.price,
        sent_via: 'cron',
        provider: null,
        status: 'failed',
        error_message: message
      });

      // Rollback do claim: a próxima execução tenta novamente.
      await supabase
        .from('price_alerts')
        .update({ last_notified_at: alert.last_notified_at })
        .eq('id', alert.id);
    }
  }

  return summary;
}
