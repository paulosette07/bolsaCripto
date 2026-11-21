import type { Metadata } from 'next';
import { ArrowDownRight, ArrowUpRight, BellOff, Clock3, Mail } from 'lucide-react';

import { AlertForm } from '@/components/alerts/alert-form';
import { deleteAlertAction, toggleAlertAction } from '@/app/actions/alerts';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { formatDateTime, formatPercent, formatPrice, formatRelativeTime, toNumber } from '@/lib/format';
import { getQuoteMap } from '@/lib/market';
import type { AssetRef } from '@/lib/market/types';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Alertas'
};

const MAX_EVENTS_SHOWN = 8;

export default async function AlertsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const [{ data: alertRows }, { data: eventRows }] = await Promise.all([
    supabase
      .from('price_alerts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('alert_events')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(MAX_EVENTS_SHOWN)
  ]);

  const alerts = alertRows ?? [];
  const events = eventRows ?? [];

  const assetRefs: AssetRef[] = alerts.map((alert) => ({
    ticker: alert.ticker,
    assetType: alert.asset_type,
    cryptoId: alert.crypto_id
  }));

  let quotes: Awaited<ReturnType<typeof getQuoteMap>> = new Map();

  try {
    quotes = await getQuoteMap(assetRefs);
  } catch {
    quotes = new Map();
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Alertas de preço</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Um e-mail é enviado quando o ativo cruza o preço-alvo. Os alertas são verificados
          automaticamente pelo servidor.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader
            title="Seus alertas"
            description={
              alerts.length === 0
                ? 'Nenhum alerta configurado'
                : `${alerts.filter((alert) => alert.is_active).length} ativos de ${alerts.length}`
            }
          />

          {alerts.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <span className="flex size-11 items-center justify-center rounded-[10px] border border-line bg-canvas text-ink-muted">
                <BellOff className="size-5" aria-hidden="true" strokeWidth={2} />
              </span>
              <p className="mt-4 text-sm font-medium text-ink">Nenhum alerta ainda</p>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-ink-muted">
                Use o formulário ao lado para ser avisado quando um ativo atingir o preço que você
                definiu.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {alerts.map((alert) => {
                const quote = quotes.get(`${alert.asset_type}:${alert.ticker.toUpperCase()}`);
                const targetPrice = toNumber(alert.target_price) ?? 0;
                const currentPrice = quote?.price ?? null;
                const distancePercent =
                  currentPrice !== null && targetPrice > 0
                    ? ((currentPrice - targetPrice) / targetPrice) * 100
                    : null;

                const isAbove = alert.condition === 'above';
                const Icon = isAbove ? ArrowUpRight : ArrowDownRight;

                return (
                  <li key={alert.id} className="px-4 py-3.5 sm:px-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-ink">{alert.ticker}</span>

                          <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-faint">
                            <Icon
                              className={`size-3 ${isAbove ? 'text-up' : 'text-down'}`}
                              aria-hidden="true"
                            />
                            {isAbove ? 'Acima de' : 'Abaixo de'}
                          </span>

                          {!alert.is_active ? (
                            <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-muted">
                              Pausado
                            </span>
                          ) : null}
                        </div>

                        <p className="numeric mt-1 text-sm text-ink">
                          Alvo {formatPrice(targetPrice)}
                          {currentPrice !== null ? (
                            <span className="text-ink-muted">
                              {' '}
                              · atual {formatPrice(currentPrice)}
                            </span>
                          ) : (
                            <span className="text-ink-faint"> · sem cotação</span>
                          )}
                        </p>

                        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-ink-faint">
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="size-3" aria-hidden="true" />
                            {alert.last_notified_at
                              ? `último aviso ${formatRelativeTime(alert.last_notified_at)}`
                              : 'nunca avisado'}
                          </span>
                          <span>Criação: {formatDateTime(alert.created_at)}</span>
                          {distancePercent !== null ? (
                            <span className="numeric">
                              Distância: {formatPercent(distancePercent)}
                            </span>
                          ) : null}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <form action={toggleAlertAction}>
                          <input type="hidden" name="id" value={alert.id} />
                          <input
                            type="hidden"
                            name="is_active"
                            value={alert.is_active ? 'false' : 'true'}
                          />
                          <Button type="submit" variant="secondary" size="sm">
                            {alert.is_active ? 'Pausar' : 'Ativar'}
                          </Button>
                        </form>

                        <form action={deleteAlertAction}>
                          <input type="hidden" name="id" value={alert.id} />
                          <Button type="submit" variant="danger" size="sm">
                            Remover
                          </Button>
                        </form>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Novo alerta"
            description="Avisamos por e-mail quando a condição for atingida"
          />
          <div className="p-4 sm:p-5">
            <AlertForm />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Histórico de disparos"
          description="Prova de que o e-mail saiu — e com qual preço"
        />

        {events.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-muted">
            Nenhum alerta disparado até agora.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Mail
                    className={`size-3.5 shrink-0 ${
                      event.status === 'sent' ? 'text-up' : 'text-down'
                    }`}
                    aria-hidden="true"
                  />
                  <p className="truncate text-sm text-ink">
                    <span className="font-medium">{event.ticker}</span>{' '}
                    <span className="text-ink-muted">
                      {event.condition === 'above' ? 'acima de' : 'abaixo de'}
                    </span>{' '}
                    <span className="numeric">{formatPrice(toNumber(event.target_price))}</span>
                    <span className="text-ink-muted">
                      {' '}
                      · atingiu{' '}
                      <span className="numeric text-ink">
                        {formatPrice(toNumber(event.price_at_trigger))}
                      </span>
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-ink-faint">
                  <span
                    className={`rounded-full px-2 py-0.5 ${
                      event.status === 'sent'
                        ? 'bg-up/12 text-up'
                        : 'bg-down/12 text-down'
                    }`}
                  >
                    {event.status === 'sent' ? 'enviado' : 'falhou'}
                  </span>
                  <span>{formatDateTime(event.created_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
