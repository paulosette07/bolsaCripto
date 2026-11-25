import { CircleDollarSign, Euro, Gem, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';

import { ChangePill } from '@/components/ui/delta';
import { formatCurrency, formatInteger, formatPrice } from '@/lib/format';
import type { MacroQuote } from '@/lib/market/macro';

/**
 * Card de um indicador macro (dólar, euro, ouro, Ibovespa).
 *
 * O valor vem em unidades diferentes por indicador — reais por dólar, reais
 * por grama de ouro, pontos de índice — então a formatação é decidida pelo
 * `unit` em vez de ficar a cargo de quem monta a lista.
 */

const ICONS: Record<MacroQuote['id'], ReactNode> = {
  'usd-brl': <CircleDollarSign className="size-3.5" aria-hidden="true" />,
  'eur-brl': <Euro className="size-3.5" aria-hidden="true" />,
  gold: <Gem className="size-3.5" aria-hidden="true" />,
  ibov: <TrendingUp className="size-3.5" aria-hidden="true" />
};

function formatValue(quote: MacroQuote): string {
  switch (quote.unit) {
    case 'currency':
      return formatPrice(quote.value);
    case 'gold-gram':
      return formatCurrency(quote.value);
    case 'index':
      return `${formatInteger(quote.value)} pts`;
  }
}

function formatRange(quote: MacroQuote): string | null {
  if (quote.dayLow === null || quote.dayHigh === null) {
    return null;
  }

  const format = quote.unit === 'index' ? formatInteger : (value: number) => formatPrice(value);

  return `mín ${format(quote.dayLow)} · máx ${format(quote.dayHigh)}`;
}

export function MacroCard({ quote }: { quote: MacroQuote }) {
  const range = formatRange(quote);
  const ounce =
    quote.usdPerOunce !== null ? `${formatPrice(quote.usdPerOunce, 'USD')}/onça` : null;

  return (
    <div className="surface-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-ink-faint">{ICONS[quote.id]}</span>
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            {quote.label}
          </p>
        </div>
        <ChangePill value={quote.changePercent} />
      </div>

      <p className="numeric mt-2 text-lg font-semibold tracking-tight text-ink sm:text-xl">
        {formatValue(quote)}
      </p>

      <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">
        {ounce ? <span className="numeric">{ounce}</span> : quote.subtitle}
      </p>

      {range ? <p className="numeric mt-0.5 text-[11px] text-ink-faint">{range}</p> : null}
    </div>
  );
}
