/**
 * Favoritos: regras que valem para web e desktop.
 *
 * Favoritar não é comprar. O favorito é só um atalho de acompanhamento — quem
 * tem posição usa `portfolio`. Por isso nada de quantidade ou preço aqui.
 */

import type { AssetRef } from '@/lib/market/types';
import type { FavoriteRow } from '@/lib/types/database';

/**
 * Teto de favoritos por usuário.
 *
 * O limite existe para a grade de cards não virar uma lista infinita no topo do
 * Mercado: doze cards cobrem três colunas em duas linhas no desktop.
 */
export const MAX_FAVORITES = 12;

/** Converte a linha do banco no identificador mínimo usado pelas cotações. */
export function toAssetRef(row: FavoriteRow): AssetRef {
  return {
    ticker: row.ticker,
    assetType: row.asset_type,
    cryptoId: row.crypto_id
  };
}

/** `stock:petr4` -> `stock:PETR4`. O banco já grava em caixa alta; isto protege a UI. */
export function favoriteKey(row: Pick<FavoriteRow, 'asset_type' | 'ticker'>): string {
  return `${row.asset_type}:${row.ticker.trim().toUpperCase()}`;
}

/** O ativo já está favoritado? Comparação por tipo + ticker, como a unique do banco. */
export function isFavorited(
  favorites: readonly Pick<FavoriteRow, 'asset_type' | 'ticker'>[],
  asset: Pick<AssetRef, 'assetType' | 'ticker'>
): boolean {
  const target = `${asset.assetType}:${asset.ticker.trim().toUpperCase()}`;

  return favorites.some((favorite) => favoriteKey(favorite) === target);
}
