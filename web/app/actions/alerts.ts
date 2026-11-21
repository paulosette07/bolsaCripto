'use server';

import { revalidatePath } from 'next/cache';

import { toNumber } from '@/lib/format';
import { getQuotes, withResolvedCryptoId } from '@/lib/market';
import { toMarketErrorMessage } from '@/lib/market/http';
import { isAssetType } from '@/lib/market/types';
import type { AlertFormState } from '@/lib/forms/states';
import type { AssetType } from '@/lib/types/database';
import { createClient } from '@/lib/supabase/server';

const MAX_TICKER_LENGTH = 20;
const MIN_COOLDOWN_MINUTES = 5;
const MAX_COOLDOWN_MINUTES = 10_080;

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === 'string' ? value.trim() : '';
}

function revalidateAlerts() {
  revalidatePath('/alertas');
  revalidatePath('/painel');
}

export async function createAlertAction(
  _previousState: AlertFormState,
  formData: FormData
): Promise<AlertFormState> {
  const rawTicker = readString(formData, 'ticker').toUpperCase();
  const assetType = readString(formData, 'asset_type');
  const condition = readString(formData, 'condition');
  const targetPrice = toNumber(readString(formData, 'target_price'));
  const cryptoIdInput = readString(formData, 'crypto_id');
  const cooldownRaw = readString(formData, 'cooldown_minutes');
  const cooldown = cooldownRaw.length > 0 ? toNumber(cooldownRaw) : 60;

  const fieldErrors: Record<string, string> = {};

  if (rawTicker.length === 0 || rawTicker.length > MAX_TICKER_LENGTH) {
    fieldErrors.ticker = 'Informe o código do ativo.';
  }

  if (!isAssetType(assetType)) {
    fieldErrors.asset_type = 'Selecione o tipo do ativo.';
  }

  if (condition !== 'above' && condition !== 'below') {
    fieldErrors.condition = 'Escolha "subir acima de" ou "cair abaixo de".';
  }

  if (targetPrice === null || targetPrice <= 0) {
    fieldErrors.target_price = 'Informe um preço-alvo maior que zero.';
  }

  if (
    cooldown === null ||
    cooldown < MIN_COOLDOWN_MINUTES ||
    cooldown > MAX_COOLDOWN_MINUTES
  ) {
    fieldErrors.cooldown_minutes = `O intervalo deve estar entre ${MIN_COOLDOWN_MINUTES} e ${MAX_COOLDOWN_MINUTES} minutos.`;
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

  let resolved;

  try {
    resolved = await withResolvedCryptoId(baseAsset);
    const quotes = await getQuotes([resolved]);

    if (quotes.length === 0) {
      return {
        status: 'error',
        message: `Não encontramos "${rawTicker}". Confira o código do ativo.`,
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

  const { error } = await supabase.from('price_alerts').insert({
    user_id: user.id,
    ticker: resolved.ticker,
    asset_type: resolved.assetType,
    crypto_id: resolved.cryptoId,
    condition: condition as 'above' | 'below',
    target_price: targetPrice ?? 0,
    cooldown_minutes: cooldown ?? 60
  });

  if (error) {
    return { status: 'error', message: error.message };
  }

  revalidateAlerts();

  return {
    status: 'success',
    message: `Alerta criado para ${resolved.ticker}. Você recebe um e-mail quando a condição for atingida.`
  };
}

/** Liga/desliga um alerta sem apagar o histórico. */
export async function toggleAlertAction(formData: FormData): Promise<void> {
  const id = readString(formData, 'id');
  const nextValue = readString(formData, 'is_active') === 'true';

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

  await supabase
    .from('price_alerts')
    .update({ is_active: nextValue })
    .eq('id', id)
    .eq('user_id', user.id);

  revalidateAlerts();
}

export async function deleteAlertAction(formData: FormData): Promise<void> {
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

  await supabase.from('price_alerts').delete().eq('id', id).eq('user_id', user.id);

  revalidateAlerts();
}
