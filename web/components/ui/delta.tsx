import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

import { formatPercent } from '@/lib/format';

interface DeltaProps {
  value: number | null | undefined;
  /** `true` mostra também o valor absoluto ao lado do percentual. */
  showValue?: boolean;
  absoluteValue?: number | null;
  className?: string;
}

/**
 * Variação com semântica de cor: verde esmeralda para alta, vermelho para baixa.
 * O ícone acompanha a cor — cor sozinha não é acessível para daltônicos.
 */
export function Delta({ value, showValue = false, absoluteValue, className }: DeltaProps) {
  const isFlat = value === null || value === undefined || value === 0;
  const isUp = !isFlat && typeof value === 'number' && value > 0;
  const Icon = isFlat ? Minus : isUp ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={clsx(
        'numeric inline-flex items-center gap-1 text-sm font-medium',
        isFlat ? 'text-ink-muted' : isUp ? 'text-up' : 'text-down',
        className
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" strokeWidth={2.5} />
      {formatPercent(value)}
      {showValue && absoluteValue !== null && absoluteValue !== undefined ? (
        <span className="text-xs text-ink-faint">
          ({new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            maximumFractionDigits: 2
          }).format(absoluteValue)}
          )
        </span>
      ) : null}
    </span>
  );
}

interface ChangePillProps {
  value: number | null | undefined;
}

/** Pílula compacta de variação, usada em tabelas e no cabeçalho do gráfico. */
export function ChangePill({ value }: ChangePillProps) {
  const isFlat = value === null || value === undefined || value === 0;
  const isUp = !isFlat && typeof value === 'number' && value > 0;

  return (
    <span
      className={clsx(
        'numeric inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
        isFlat
          ? 'bg-surface-3 text-ink-muted'
          : isUp
            ? 'bg-up/12 text-up'
            : 'bg-down/12 text-down'
      )}
    >
      {formatPercent(value)}
    </span>
  );
}
