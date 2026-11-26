import 'server-only';

import { cookies } from 'next/headers';

import { getUsdBrlRate } from '@/lib/market/fx';
import { parseCurrency } from '@/lib/market/types';
import type { Currency } from '@/lib/market/types';
import type { MoneyContext } from '@/lib/money';

/**
 * Preferência de moeda do usuário.
 *
 * Vive em cookie (e não em coluna do banco) porque toda página é renderizada no
 * servidor e precisa da escolha **antes** do primeiro byte: com cookie o
 * servidor já entrega os números na moeda certa, sem um flash em real.
 *
 * O cookie é `httpOnly` (o cliente não precisa lê-lo — o tema/formatação vem do
 * servidor) e dura um ano.
 */

export const DISPLAY_CURRENCY_COOKIE = 'bm-display-currency';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export const DISPLAY_CURRENCY_COOKIE_OPTIONS = {
  path: '/',
  maxAge: ONE_YEAR_SECONDS,
  sameSite: 'lax' as const,
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production'
};

/** Moeda salva pelo usuário. Sem cookie (ou cookie inválido) = real. */
export async function getDisplayCurrency(): Promise<Currency> {
  const store = await cookies();

  return parseCurrency(store.get(DISPLAY_CURRENCY_COOKIE)?.value);
}

/**
 * Contexto monetário da página: moeda escolhida + taxa de câmbio.
 *
 * A taxa só é buscada quando a moeda é dólar — em real nada precisa ser
 * convertido e uma chamada a menos no caminho crítico importa.
 */
export async function getMoneyContext(): Promise<MoneyContext> {
  const currency = await getDisplayCurrency();

  if (currency === 'BRL') {
    return { currency, usdBrl: null };
  }

  const fx = await getUsdBrlRate();

  return { currency, usdBrl: fx.rate };
}

/** Texto curto para telas: "Real (R$)" / "Dólar (US$)". */
export function displayCurrencyLabel(currency: Currency): string {
  return currency === 'USD' ? 'Dólar (US$)' : 'Real (R$)';
}
