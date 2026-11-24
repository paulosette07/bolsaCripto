'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { assetHref } from '@/lib/market/types';
import type { AssetSearchResult, Currency } from '@/lib/market/types';

import { AssetSearch } from './asset-search';

interface MarketNavSearchProps {
  /** Moeda escolhida: a busca não devolve o usuário para o real. */
  currency: Currency;
}

/** Busca da página de mercado: ao escolher, navega para o ativo via URL. */
export function MarketNavSearch({ currency }: MarketNavSearchProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSelect(result: AssetSearchResult) {
    const href = assetHref(
      {
        ticker: result.ticker,
        assetType: result.assetType,
        cryptoId: result.cryptoId
      },
      { currency }
    );

    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <div aria-busy={isPending}>
      <AssetSearch
        onSelect={handleSelect}
        placeholder="Buscar ativo: PETR4, VALE3, BTC, ETH…"
      />
    </div>
  );
}
