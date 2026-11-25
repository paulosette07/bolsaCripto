import { Landmark } from 'lucide-react';

import { Card, CardHeader } from '@/components/ui/card';
import { formatIsoDate, formatRate } from '@/lib/format';
import type { MacroRate } from '@/lib/market/rates';

/**
 * Juros e inflação do Brasil (Banco Central).
 *
 * Dois números que mudam a decisão de qualquer investidor em renda fixa:
 * a Selic meta é o teto do CDI, e o IPCA é o que corrói o rendimento. Ficam
 * aqui, no painel, porque comparar com a carteira é imediato.
 */
export function RatesCard({ rates }: { rates: readonly MacroRate[] }) {
  if (rates.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader title="Juros e inflação" description="Referência do Banco Central" />

      <ul className="divide-y divide-line">
        {rates.map((rate) => (
          <li key={rate.id} className="flex items-baseline justify-between gap-3 px-4 py-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-2">
              <Landmark className="size-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{rate.label}</p>
                <p className="truncate text-[11px] text-ink-faint">
                  {rate.note}
                  {rate.referenceDate ? ` · ${formatIsoDate(rate.referenceDate)}` : ''}
                </p>
              </div>
            </div>

            <span className="numeric shrink-0 text-base font-semibold text-ink">
              {formatRate(rate.value)}
            </span>
          </li>
        ))}
      </ul>

      <p className="border-t border-line px-4 py-2.5 text-[11px] leading-relaxed text-ink-faint sm:px-5">
        Selic é a taxa básica definida pelo Copom; o IPCA é a inflação oficial do IBGE.
      </p>
    </Card>
  );
}
