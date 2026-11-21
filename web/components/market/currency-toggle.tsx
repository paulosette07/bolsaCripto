'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import type { AssetRef, Currency } from '@/lib/market/types';
import { CURRENCIES, CURRENCY_LABELS, CURRENCY_SYMBOLS } from '@/lib/market/types';

interface CurrencyToggleProps {
  asset: AssetRef;
  currency: Currency;
}

/**
 * Alterna a moeda de exibição de uma cripto (real ↔ dólar).
 *
 * A escolha vive na URL (`?currency=usd`), não em estado local: o server
 * component busca a cotação já na moeda certa e o link fica compartilhável.
 * Só é renderizado para cripto — a B3 não negocia em dólar.
 */
export function CurrencyToggle({ asset, currency }: CurrencyToggleProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function selectCurrency(nextCurrency: Currency) {
    if (nextCurrency === currency) {
      return;
    }

    const params = new URLSearchParams({
      ticker: asset.ticker,
      type: asset.assetType,
      currency: nextCurrency
    });

    if (asset.cryptoId) {
      params.set('cryptoId', asset.cryptoId);
    }

    startTransition(() => {
      router.push(`/mercado?${params.toString()}`);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <div
        role="group"
        aria-label="Moeda de exibição"
        className="flex rounded-[8px] border border-line bg-canvas p-0.5"
      >
        {CURRENCIES.map((option) => {
          const isActive = option === currency;

          return (
            <button
              key={option}
              type="button"
              onClick={() => selectCurrency(option)}
              aria-pressed={isActive}
              title={`Ver preço em ${CURRENCY_LABELS[option].toLowerCase()}`}
              className={`inline-flex items-center gap-1 rounded-[6px] px-2.5 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-surface-3 text-ink'
                  : 'text-ink-faint hover:text-ink-muted'
              }`}
            >
              <span aria-hidden="true">{CURRENCY_SYMBOLS[option]}</span>
              {option}
            </button>
          );
        })}
      </div>

      {isPending ? (
        <Loader2 className="size-3.5 animate-spin text-ink-faint" aria-label="Carregando" />
      ) : null}
    </div>
  );
}
