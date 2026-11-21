'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import type { AssetSearchResult } from '@/lib/market/types';

import { AssetSearch } from './asset-search';

/** Busca da página de mercado: ao escolher, navega para o ativo via URL. */
export function MarketNavSearch() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSelect(result: AssetSearchResult) {
    const params = new URLSearchParams({
      ticker: result.ticker,
      type: result.assetType
    });

    if (result.cryptoId) {
      params.set('cryptoId', result.cryptoId);
    }

    startTransition(() => {
      router.push(`/mercado?${params.toString()}`);
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
