import type { Currency, Quote } from '@/lib/market/types';

/**
 * Conversão entre real e dólar.
 *
 * O app tem duas moedas nativas: a B3 negocia em BRL e a cripto é cotada em
 * USD. Quando o usuário escolhe *ver tudo em dólar*, os ativos da B3 precisam
 * ser convertidos — e vice-versa. A taxa vem de `lib/market/fx` (BCB/Yahoo),
 * nunca de uma constante.
 *
 * Regra de ouro: se a taxa não está disponível (`null`), nada é convertido.
 * Melhor mostrar o valor na moeda original do que exibir um número inventado.
 */

/** Moeda em que `portfolio.avg_price` é gravado, para os dois tipos de ativo. */
export const BASE_CURRENCY: Currency = 'BRL';

export interface MoneyContext {
  /** Moeda de exibição escolhida pelo usuário. */
  currency: Currency;
  /** Quantos reais vale 1 dólar. `null` = sem câmbio, sem conversão. */
  usdBrl: number | null;
}

export const DEFAULT_MONEY_CONTEXT: MoneyContext = { currency: 'BRL', usdBrl: null };

/** `true` quando a conversão é possível e necessária. */
export function canConvert(from: Currency, to: Currency, usdBrl: number | null): boolean {
  if (from === to) {
    return false;
  }

  return typeof usdBrl === 'number' && Number.isFinite(usdBrl) && usdBrl > 0;
}

/**
 * Converte um valor entre as duas moedas suportadas.
 *
 * Sem taxa disponível devolve o valor original — quem chama deve continuar
 * exibindo `from` no rótulo (é o que `quoteInCurrency` garante).
 */
export function convertAmount(
  value: number | null | undefined,
  from: Currency,
  to: Currency,
  usdBrl: number | null
): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }

  if (!canConvert(from, to, usdBrl) || usdBrl === null) {
    return value;
  }

  return from === 'BRL' ? value / usdBrl : value * usdBrl;
}

/**
 * Reescreve uma cotação na moeda de exibição.
 *
 * Converte preço, variação absoluta e fechamento anterior juntos: se só o
 * preço mudasse de moeda, a variação do dia apareceria com duas unidades
 * diferentes no mesmo bloco.
 */
export function quoteInCurrency(
  quote: Quote,
  target: Currency,
  usdBrl: number | null
): Quote {
  if (!canConvert(quote.currency, target, usdBrl)) {
    return quote;
  }

  return {
    ...quote,
    price: convertAmount(quote.price, quote.currency, target, usdBrl) ?? quote.price,
    changeValue: convertAmount(quote.changeValue, quote.currency, target, usdBrl) ?? quote.changeValue,
    previousClose: convertAmount(quote.previousClose, quote.currency, target, usdBrl),
    currency: target
  };
}

/** Aplica `quoteInCurrency` a uma lista, preservando a ordem. */
export function quotesInCurrency(
  quotes: readonly Quote[],
  target: Currency,
  usdBrl: number | null
): Quote[] {
  return quotes.map((quote) => quoteInCurrency(quote, target, usdBrl));
}

/** Aplica `quoteInCurrency` a um mapa `assetKey -> cotação`. */
export function quoteMapInCurrency(
  quotes: ReadonlyMap<string, Quote>,
  target: Currency,
  usdBrl: number | null
): Map<string, Quote> {
  const converted = new Map<string, Quote>();

  for (const [key, quote] of quotes) {
    converted.set(key, quoteInCurrency(quote, target, usdBrl));
  }

  return converted;
}

/** Símbolo textual da moeda para rótulos ("reais", "dólares"). */
export function currencyNoun(currency: Currency): string {
  return currency === 'USD' ? 'dólares' : 'reais';
}
