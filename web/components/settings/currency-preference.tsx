'use client';

import clsx from 'clsx';
import { Check, Loader2 } from 'lucide-react';
import { useFormStatus } from 'react-dom';

import { saveDisplayCurrencyAction } from '@/app/actions/settings';
import type { Currency } from '@/lib/market/types';

interface CurrencyPreferenceProps {
  /** Moeda atualmente salva. */
  current: Currency;
}

interface OptionDescriptor {
  value: Currency;
  title: string;
  symbol: string;
  description: string;
}

const OPTIONS: readonly OptionDescriptor[] = [
  {
    value: 'BRL',
    title: 'Real',
    symbol: 'R$',
    description:
      'Cripto em reais, como no mercado brasileiro. Preço, posição e patrimônio de cripto aparecem em R$.'
  },
  {
    value: 'USD',
    title: 'Dólar',
    symbol: 'US$',
    description:
      'Cripto em dólares, a moeda nativa das exchanges. O custo em reais é convertido pela PTAX na leitura.'
  }
];

function OptionButton({
  option,
  isActive
}: {
  option: OptionDescriptor;
  isActive: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      name="currency"
      value={option.value}
      aria-pressed={isActive}
      disabled={pending}
      className={clsx(
        'group relative flex w-full items-start gap-3 rounded-[10px] border p-4 text-left transition-colors',
        isActive
          ? 'border-up/45 bg-up/8'
          : 'border-line bg-canvas hover:border-line-strong hover:bg-surface-2',
        pending && 'cursor-progress opacity-80'
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(
          'numeric mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[8px] border text-xs font-semibold',
          isActive
            ? 'border-up/40 bg-up/12 text-up'
            : 'border-line bg-surface-3 text-ink-muted'
        )}
      >
        {option.symbol}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="text-sm font-semibold tracking-tight text-ink">{option.title}</span>
          {isActive ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-up/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-up">
              <Check className="size-2.5" aria-hidden="true" strokeWidth={3} />
              em uso
            </span>
          ) : null}
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-ink-muted">
          {option.description}
        </span>
      </span>

      {pending ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-ink-faint" aria-hidden="true" />
      ) : null}
    </button>
  );
}

/**
 * Escolha da moeda de exibição.
 *
 * Cada opção é um botão de submit com `name="currency"`: funciona sem
 * JavaScript e o valor já chega como `FormData` na server action. O estado
 * pendente vem de `useFormStatus`, que precisa estar dentro do `<form>`.
 */
export function CurrencyPreference({ current }: CurrencyPreferenceProps) {
  return (
    <form action={saveDisplayCurrencyAction} className="space-y-3">
      {OPTIONS.map((option) => (
        <OptionButton key={option.value} option={option} isActive={option.value === current} />
      ))}

      <p className="px-1 text-[11px] leading-relaxed text-ink-faint">
        Vale para cripto no Mercado, no Painel e na Carteira, e define a moeda do toggle de cripto.
        Ações e FIIs continuam sempre em reais — a escolha não afeta a bolsa.
      </p>
    </form>
  );
}
