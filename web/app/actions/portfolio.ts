'use server';

import { revalidatePath } from 'next/cache';

import { toNumber } from '@/lib/format';
import { getQuotes, withResolvedCryptoId } from '@/lib/market';
import { toMarketErrorMessage } from '@/lib/market/http';
import { isAssetType } from '@/lib/market/types';
import type { PositionFormState } from '@/lib/forms/states';
import { initialPositionState } from '@/lib/forms/states';
import { mergeAveragePrice, mergeQuantity } from '@/lib/portfolio';
import type { AssetType } from '@/lib/types/database';
import { createClient } from '@/lib/supabase/server';

const MAX_TICKER_LENGTH = 20;
const MAX_QUANTITY = 1_000_000_000;
const MAX_NOTE_LENGTH = 280;

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === 'string' ? value.trim() : '';
}

function revalidatePortfolio() {
  revalidatePath('/carteira');
  revalidatePath('/painel');
}

/**
 * Cadastra uma posição. Se o ativo já existir na carteira do usuário, soma a
 * quantidade e recalcula o preço médio ponderado — é o comportamento esperado
 * quando se compra mais do mesmo papel.
 */
export async function addPositionAction(
  _previousState: PositionFormState,
  formData: FormData
): Promise<PositionFormState> {
  const rawTicker = readString(formData, 'ticker').toUpperCase();
  const assetType = readString(formData, 'asset_type');
  const quantity = toNumber(readString(formData, 'quantity'));
  const avgPriceRaw = readString(formData, 'avg_price');
  const avgPrice = avgPriceRaw.length > 0 ? toNumber(avgPriceRaw) : null;
  const cryptoIdInput = readString(formData, 'crypto_id');
  const notes = readString(formData, 'notes').slice(0, MAX_NOTE_LENGTH);

  const fieldErrors: Record<string, string> = {};

  if (rawTicker.length === 0 || rawTicker.length > MAX_TICKER_LENGTH) {
    fieldErrors.ticker = 'Informe o código do ativo (ex: PETR4, BTC).';
  }

  if (!isAssetType(assetType)) {
    fieldErrors.asset_type = 'Selecione o tipo do ativo.';
  }

  if (quantity === null || quantity <= 0) {
    fieldErrors.quantity = 'A quantidade precisa ser maior que zero.';
  } else if (quantity > MAX_QUANTITY) {
    fieldErrors.quantity = 'Quantidade acima do limite permitido.';
  }

  if (avgPrice !== null && (!Number.isFinite(avgPrice) || avgPrice < 0)) {
    fieldErrors.avg_price = 'Preço médio inválido.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { status: 'error', message: 'Revise os campos destacados.', fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 'error', message: 'Sessão expirada. Entre novamente.' };
  }

  const baseAsset = {
    ticker: rawTicker,
    assetType: assetType as AssetType,
    cryptoId: cryptoIdInput.length > 0 ? cryptoIdInput : null
  };

  // Confirma o ativo na fonte antes de gravar: ticker errado não entra na base.
  let resolved;

  try {
    resolved = await withResolvedCryptoId(baseAsset);
    const quotes = await getQuotes([resolved]);

    if (quotes.length === 0) {
      return {
        status: 'error',
        message: `Não encontramos "${rawTicker}" ${
          baseAsset.assetType === 'crypto' ? 'entre as criptomoedas' : 'na B3'
        }. Confira o código.`,
        fieldErrors: { ticker: 'Ativo não encontrado.' }
      };
    }
  } catch (error) {
    return { status: 'error', message: toMarketErrorMessage(error) };
  }

  if (resolved.assetType === 'crypto' && !resolved.cryptoId) {
    return {
      status: 'error',
      message: 'Não foi possível identificar essa criptomoeda. Use a busca para escolher.',
      fieldErrors: { ticker: 'Criptomoeda não identificada.' }
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from('portfolio')
    .select('*')
    .eq('user_id', user.id)
    .eq('ticker', resolved.ticker)
    .eq('asset_type', resolved.assetType)
    .maybeSingle();

  if (existingError) {
    return { status: 'error', message: existingError.message };
  }

  if (existing) {
    const currentQuantity = toNumber(existing.quantity) ?? 0;
    const currentAvgPrice = toNumber(existing.avg_price);
    const nextQuantity = mergeQuantity(currentQuantity, quantity ?? 0);
    const nextAvgPrice = mergeAveragePrice(
      currentQuantity,
      currentAvgPrice,
      quantity ?? 0,
      avgPrice
    );

    const { error } = await supabase
      .from('portfolio')
      .update({
        quantity: nextQuantity,
        avg_price: nextAvgPrice,
        notes: notes.length > 0 ? notes : existing.notes
      })
      .eq('id', existing.id)
      .eq('user_id', user.id);

    if (error) {
      return { status: 'error', message: error.message };
    }

    revalidatePortfolio();

    return {
      status: 'success',
      message: `Posição atualizada: agora você tem ${nextQuantity} de ${resolved.ticker}.`
    };
  }

  const { error } = await supabase.from('portfolio').insert({
    user_id: user.id,
    ticker: resolved.ticker,
    asset_type: resolved.assetType,
    crypto_id: resolved.cryptoId,
    quantity: quantity ?? 0,
    avg_price: avgPrice,
    notes: notes.length > 0 ? notes : null
  });

  if (error) {
    return { status: 'error', message: error.message };
  }

  revalidatePortfolio();

  return { status: 'success', message: `${resolved.ticker} adicionado à carteira.` };
}

/** Ajusta quantidade e preço médio de uma posição existente. */
export async function updatePositionAction(
  _previousState: PositionFormState,
  formData: FormData
): Promise<PositionFormState> {
  const id = readString(formData, 'id');
  const quantity = toNumber(readString(formData, 'quantity'));
  const avgPriceRaw = readString(formData, 'avg_price');
  const avgPrice = avgPriceRaw.length > 0 ? toNumber(avgPriceRaw) : null;

  if (id.length === 0) {
    return { status: 'error', message: 'Posição inválida.' };
  }

  if (quantity === null || quantity <= 0 || quantity > MAX_QUANTITY) {
    return {
      status: 'error',
      message: 'Quantidade inválida.',
      fieldErrors: { quantity: 'Informe um valor maior que zero.' }
    };
  }

  if (avgPrice !== null && (!Number.isFinite(avgPrice) || avgPrice < 0)) {
    return { status: 'error', message: 'Preço médio inválido.' };
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 'error', message: 'Sessão expirada. Entre novamente.' };
  }

  const { error } = await supabase
    .from('portfolio')
    .update({ quantity, avg_price: avgPrice })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return { status: 'error', message: error.message };
  }

  revalidatePortfolio();

  return { status: 'success', message: 'Posição atualizada.' };
}

/**
 * Wrapper para uso direto em `<form action={...}>`.
 * Um form action precisa devolver `void`; a versão com estado serve ao
 * `useActionState` de formulários que exibem erro por campo.
 */
export async function savePositionAction(formData: FormData): Promise<void> {
  await updatePositionAction(initialPositionState, formData);
}

/** Remove uma posição. Usado como `action` de formulário (sem estado). */
export async function deletePositionAction(formData: FormData): Promise<void> {
  const id = readString(formData, 'id');

  if (id.length === 0) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  await supabase.from('portfolio').delete().eq('id', id).eq('user_id', user.id);

  revalidatePortfolio();
}
