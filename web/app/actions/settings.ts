'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import { isCurrency } from '@/lib/market/types';
import type { Currency } from '@/lib/market/types';
import {
  DISPLAY_CURRENCY_COOKIE,
  DISPLAY_CURRENCY_COOKIE_OPTIONS
} from '@/lib/preferences/display-currency';

/**
 * Preferência de moeda: real ou dólar.
 *
 * Grava o cookie e revalida as páginas que mostram dinheiro. Sem o
 * `revalidatePath`, o cache do App Router continuaria servindo o HTML anterior
 * (em real) até o usuário navegar para outra rota.
 */

/** Todas as telas que exibem preço. Mantidas juntas de propósito. */
const MONEY_PATHS = ['/painel', '/mercado', '/carteira', '/configuracoes'] as const;

async function writeCurrencyCookie(currency: Currency): Promise<void> {
  const store = await cookies();

  store.set(DISPLAY_CURRENCY_COOKIE, currency, DISPLAY_CURRENCY_COOKIE_OPTIONS);

  for (const path of MONEY_PATHS) {
    revalidatePath(path);
  }
}

/** Ação do formulário de Configurações (`<form action={...}>`). */
export async function saveDisplayCurrencyAction(formData: FormData): Promise<void> {
  const raw = formData.get('currency');

  if (!isCurrency(raw)) {
    return;
  }

  await writeCurrencyCookie(raw);
}

/**
 * Mesma gravação, chamada pelo toggle de moeda do Mercado.
 *
 * Exportada como server action: quando o usuário alterna real/dólar numa
 * cotação, a escolha vira padrão para o app inteiro — é o que "sempre exibir em
 * dólar" significa na prática.
 */
export async function persistDisplayCurrencyAction(currency: Currency): Promise<void> {
  if (!isCurrency(currency)) {
    return;
  }

  await writeCurrencyCookie(currency);
}
