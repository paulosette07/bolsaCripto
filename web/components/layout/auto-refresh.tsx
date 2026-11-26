'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

import { formatShortTime } from '@/lib/format';
import { REFRESH_INTERVAL_MINUTES, REFRESH_INTERVAL_MS } from '@/lib/market/refresh';

interface AutoRefreshProps {
  /** Rótulo curto do que está sendo atualizado ("Painel", "Mercado"). */
  label: string;
}

/**
 * Atualiza os dados da página a cada N minutos, sem recarregar a página.
 *
 * `router.refresh()` revalida os Server Components mantendo o estado do
 * cliente (aba aberta, range do gráfico, formulário preenchido), o que um
 * `location.reload()` destruiria.
 *
 * O timer reinicia quando a aba volta a ficar visível: navegador em background
 * estrangula `setInterval`, e voltar para a aba é justamente o momento em que o
 * usuário quer o preço atual.
 */
export function AutoRefresh({ label }: AutoRefreshProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });

    setLastUpdate(formatShortTime(Date.now()));
  }, [router]);

  useEffect(() => {
    const start = () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
      }

      timerRef.current = setInterval(refresh, REFRESH_INTERVAL_MS);
    };

    const stop = () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
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
  }, [refresh]);

  return (
    <div className="flex items-center gap-2 text-[11px] text-ink-faint">
      <button
        type="button"
        onClick={refresh}
        disabled={isPending}
        title={`Atualiza sozinho a cada ${REFRESH_INTERVAL_MINUTES} minutos`}
        className="inline-flex items-center gap-1.5 rounded-[6px] border border-line bg-canvas px-2 py-1 font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:cursor-progress disabled:opacity-70"
      >
        <RefreshCw
          className={isPending ? 'size-3 animate-spin' : 'size-3'}
          aria-hidden="true"
          strokeWidth={2.2}
        />
        Atualizar
      </button>

      <span className="numeric" aria-live="polite">
        {isPending
          ? `Atualizando ${label.toLowerCase()}…`
          : lastUpdate
            ? `${label} atualizado ${lastUpdate}`
            : `Atualiza a cada ${REFRESH_INTERVAL_MINUTES} min`}
      </span>
    </div>
  );
}
