'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { assetHref } from '@/lib/market/types';
import type { AssetSearchResult } from '@/lib/market/types';

import { AssetSearch } from './asset-search';

/** Busca da página de mercado: ao escolher, navega para o ativo via URL. */
export function MarketNavSearch() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSelect(result: AssetSearchResult) {
    const href = assetHref({
      ticker: result.ticker,
      assetType: result.assetType,
      cryptoId: result.cryptoId
    });

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
