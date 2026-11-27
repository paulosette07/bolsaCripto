'use client';

import clsx from 'clsx';
import { DollarSign, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { formatPercent, formatShortTime } from '@/lib/format';
import type { FxSnapshotJson } from '@/lib/market/fx-snapshot';
import { REFRESH_INTERVAL_MINUTES, REFRESH_INTERVAL_MS } from '@/lib/market/refresh';

/**
 * Faixa fixa do dólar comercial.
 *
 * Fica no topo do app inteiro (shell logado, telas de login e home) porque a
 * taxa USD/BRL é o número que dá contexto a tudo: patrimônio em dólar, cripto
 * convertida e comparação com a B3. Sem ela o usuário teria que abrir
 * Configurações para saber o câmbio do dia.
 *
 * O primeiro valor vem do servidor (`initial`), então o número já aparece
 * correto no HTML. Depois disso o componente se atualiza sozinho a cada
 * **5 minutos** — o mesmo intervalo do refresh das telas — buscando
 * `/api/fx`, que é cacheado na CDN com o mesmo TTL.
 *
 * Falha de rede não apaga o último valor conhecido: a faixa continua mostrando
 * a cotação anterior com o horário em que ela foi lida. Um número de 5 minutos
 * atrás é melhor que um traço.
 */

const FX_ENDPOINT = '/api/fx';

/** Formato de câmbio: quatro casas, como nas mesas de operação. */
const rateFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 4,
  maximumFractionDigits: 4
});

interface FxTickerProps {
  /** Valor renderizado no servidor, para o HTML já sair com a cotação. */
  initial: FxSnapshotJson | null;
  /** `bar`: faixa do topo (shell). `inline`: chip discreto (login/home). */
  variant?: 'bar' | 'inline';
  className?: string;
}

export function FxTicker({ initial, variant = 'bar', className }: FxTickerProps) {
  const [snapshot, setSnapshot] = useState<FxSnapshotJson | null>(initial);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setIsPending(true);

    try {
      const response = await fetch(FX_ENDPOINT, { headers: { accept: 'application/json' } });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const next = (await response.json()) as FxSnapshotJson;

      setSnapshot(next);
      setSyncedAt(formatShortTime(Date.now()));
      // `rate: null` significa "as duas fontes caíram": o valor é antigo.
      setIsStale(next.rate === null);
    } catch {
      setIsStale(true);
    } finally {
      setIsPending(false);
    }
  }, []);

  useEffect(() => {
    const start = () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
      }

      timerRef.current = setInterval(load, REFRESH_INTERVAL_MS);
    };

    const stop = () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    // Navegador em background estrangula `setInterval`; voltar para a aba é
    // exatamente o momento em que o usuário quer o câmbio atual.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void load();
        start();
      } else {
        stop();
      }
    };

    start();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [load]);

  const rate = snapshot?.rate ?? null;
  const change = snapshot?.changePercent ?? null;
  const isUp = (change ?? 0) >= 0;

  const tone = rate === null
    ? 'text-ink-muted'
    : change === null
      ? 'text-ink'
      : isUp
        ? 'text-up'
        : 'text-down';

  const tooltip =
    rate === null
      ? 'Dólar comercial indisponível nas fontes agora. Atualiza sozinho a cada 5 minutos.'
      : `Dólar comercial (${snapshot?.source?.toUpperCase() ?? 'BCB'})${
          snapshot?.referenceDate ? ` · referência ${snapshot.referenceDate}` : ''
        }. Atualiza sozinho a cada ${REFRESH_INTERVAL_MINUTES} minutos.`;

  return (
    <button
      type="button"
      onClick={() => void load()}
      disabled={isPending}
      title={tooltip}
      aria-label={tooltip}
      className={clsx(
        'inline-flex items-center gap-2 rounded-[8px] border border-line bg-canvas/80 px-2.5 py-1.5 text-left transition-colors hover:border-line-strong disabled:cursor-progress',
        variant === 'inline' && 'bg-transparent',
        className
      )}
    >
      <DollarSign className="size-3.5 shrink-0 text-ink-faint" aria-hidden="true" strokeWidth={2.2} />

      <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-faint">
        Dólar
      </span>

      <span className="numeric text-sm font-semibold leading-none text-ink">
        {rate === null ? '—' : rateFormatter.format(rate)}
      </span>

      <span className={clsx('numeric text-[11px] font-medium leading-none', tone)}>
        {change === null ? '' : formatPercent(change)}
      </span>

      <span className="numeric hidden text-[10px] leading-none text-ink-faint sm:inline">
        {isPending
          ? 'atualizando…'
          : isStale
            ? 'sem conexão'
            : syncedAt
              ? `atualizado ${syncedAt}`
              : `a cada ${REFRESH_INTERVAL_MINUTES} min`}
      </span>

      <RefreshCw
        className={clsx('size-3 shrink-0 text-ink-faint', isPending && 'animate-spin')}
        aria-hidden="true"
        strokeWidth={2.2}
      />
    </button>
  );
}
