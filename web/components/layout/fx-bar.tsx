import clsx from 'clsx';

import type { FxSnapshotJson } from '@/lib/market/fx-snapshot';

import { FxTicker } from './fx-ticker';

interface FxBarProps {
  fx: FxSnapshotJson | null;
  /** Texto de apoio à direita (some no mobile para não apertar a faixa). */
  note?: string;
  className?: string;
}

/**
 * Faixa do dólar grudada no topo da tela.
 *
 * Existe como componente próprio porque a mesma faixa aparece em contextos
 * diferentes — app logado, confirmação de e-mail pendente e telas de entrada —
 * e em todos ela precisa ser idêntica: mesmo valor, mesma cadência de 5 min.
 */
export function FxBar({ fx, note, className }: FxBarProps) {
  return (
    <div
      className={clsx(
        'sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur',
        className
      )}
      style={{ height: '2.75rem' }}
    >
      <div className="mx-auto flex h-full w-full max-w-[1440px] items-center justify-between gap-3 px-3 sm:px-4">
        <FxTicker initial={fx} />

        {note ? (
          <p className="hidden text-[10px] uppercase tracking-[0.08em] text-ink-faint md:block">
            {note}
          </p>
        ) : null}
      </div>
    </div>
  );
}
