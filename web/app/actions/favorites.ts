'use server';

import { revalidatePath } from 'next/cache';

import { MAX_FAVORITES } from '@/lib/favorites';
import { getQuotes, withResolvedCryptoId } from '@/lib/market';
import { isAssetType } from '@/lib/market/types';
import type { AssetType } from '@/lib/types/database';
import { createClient } from '@/lib/supabase/server';

const MAX_TICKER_LENGTH = 20;

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === 'string' ? value.trim() : '';
}

function revalidateFavorites() {
  revalidatePath('/mercado');
}

/**
 * Liga/desliga o favorito de um ativo.
 *
 * Uma ação só, porque a estrela é um interruptor: se já está favoritado, remove;
 * se não está, adiciona. O `form` do card e o do cabeçalho da cotação apontam
 * para cá, então não há estado duplicado para sincronizar.
 *
 * Falhas silenciosas são propositais: favoritar nunca deve derrubar a página.
 * O caso "tabela ausente" aparece na própria tela como aviso de configuração.
 */
export async function toggleFavoriteAction(formData: FormData): Promise<void> {
  const ticker = readString(formData, 'ticker').toUpperCase();
  const rawAssetType = readString(formData, 'asset_type');
  const cryptoIdInput = readString(formData, 'crypto_id');

  if (ticker.length === 0 || ticker.length > MAX_TICKER_LENGTH || !isAssetType(rawAssetType)) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  const { data: existing, error: findError } = await supabase
    .from('favorites')
    .select('id')
    .eq('user_id', user.id)
    .eq('ticker', ticker)
    .eq('asset_type', rawAssetType)
    .maybeSingle();

  if (findError) {
    return;
  }

  if (existing) {
    await supabase.from('favorites').delete().eq('id', existing.id).eq('user_id', user.id);

    revalidateFavorites();

    return;
  }

  const { count } = await supabase
    .from('favorites')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if ((count ?? 0) >= MAX_FAVORITES) {
    return;
  }

  const baseAsset = {
    ticker,
    assetType: rawAssetType as AssetType,
    cryptoId: cryptoIdInput.length > 0 ? cryptoIdInput : null
  };

  // Confirma o ativo na fonte: favorito quebrado vira card sem cotação.
  let resolved;

  try {
    resolved = await withResolvedCryptoId(baseAsset);

    if (resolved.assetType === 'crypto' && !resolved.cryptoId) {
      return;
    }

    const quotes = await getQuotes([resolved]);

    if (quotes.length === 0) {
      return;
    }
  } catch {
    return;
  }

  const { error } = await supabase.from('favorites').insert({
    user_id: user.id,
    ticker: resolved.ticker.trim().toUpperCase(),
    asset_type: resolved.assetType,
    crypto_id: resolved.cryptoId
  });

  if (error) {
    return;
  }

  revalidateFavorites();
}
