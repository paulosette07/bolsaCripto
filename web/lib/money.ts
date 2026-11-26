import type { Currency, Quote } from '@/lib/market/types';
import type { AssetType } from '@/lib/types/database';

/**
 * Conversão entre real e dólar.
 *
 * A regra do produto é assimétrica de propósito:
 *
 *  - **B3 é sempre em reais.** Ações e FIIs são negociados em BRL, o provento é
 *    pago em BRL e o preço médio é digitado em BRL. Nada é convertido.
 *  - **Cripto segue a preferência** de Configurações (real ou dólar).
 *
 * A taxa vem de `lib/market/fx` (BCB/Yahoo), nunca de uma constante. Regra de
 * ouro: se a taxa não está disponível (`null`), nada é convertido — melhor
 * mostrar o valor na moeda original do que exibir um número inventado.
 */

/** Moeda em que `portfolio.avg_price` é gravado, para os dois tipos de ativo. */
export const BASE_CURRENCY: Currency = 'BRL';

export interface MoneyContext {
  /** Moeda escolhida para criptomoedas. */
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
 * Moeda de exibição de um ativo.
 *
 * Cripto acompanha a preferência do usuário; bolsa ignora a preferência e
 * continua em reais — é onde o papel é realmente negociado.
 */
export function displayCurrencyFor(assetType: AssetType, preference: Currency): Currency {
  return assetType === 'crypto' ? preference : BASE_CURRENCY;
}

/**
 * Converte um valor entre as duas moedas suportadas.
 *
 * Sem taxa disponível devolve o valor original — quem chama deve continuar
 * exibindo `from` no rótulo.
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
 * Valor em reais, para comparar ativos de moedas diferentes.
 *
 * Diferente de `convertAmount`, aqui **não** existe fallback: sem câmbio o
 * valor em reais é `null`, porque somar dólar como se fosse real distorceria
 * a alocação da carteira.
 */
export function amountInBrl(
  value: number | null | undefined,
  from: Currency,
  usdBrl: number | null
): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }

  if (from === BASE_CURRENCY) {
    return value;
  }

  if (!canConvert(from, BASE_CURRENCY, usdBrl) || usdBrl === null) {
    return null;
  }

  return value * usdBrl;
}

/**
 * Reescreve uma cotação na moeda de exibição.
 *
 * Converte preço, variação absoluta e fechamento anterior juntos: se só o
 * preço mudasse de moeda, a variação do dia apareceria com duas unidades
 * diferentes no mesmo bloco.
 */
export function quoteInCurrency(quote: Quote, target: Currency, usdBrl: number | null): Quote {
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

/**
 * Cotação na moeda em que ela deve aparecer: cripto na preferência, bolsa em
 * reais.
 */
export function quoteForDisplay(
  quote: Quote,
  cryptoCurrency: Currency,
  usdBrl: number | null
): Quote {
  return quoteInCurrency(quote, displayCurrencyFor(quote.assetType, cryptoCurrency), usdBrl);
}

/** Aplica `quoteInCurrency` a uma lista, preservando a ordem. */
export function quotesInCurrency(
  quotes: readonly Quote[],
  target: Currency,
  usdBrl: number | null
): Quote[] {
  return quotes.map((quote) => quoteInCurrency(quote, target, usdBrl));
}

/** Aplica `quoteForDisplay` a uma lista de cotações. */
export function quotesForDisplay(
  quotes: readonly Quote[],
  cryptoCurrency: Currency,
  usdBrl: number | null
): Quote[] {
  return quotes.map((quote) => quoteForDisplay(quote, cryptoCurrency, usdBrl));
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

/**
 * Aplica `quoteForDisplay` a um mapa `assetKey -> cotação` — cripto na moeda
 * escolhida, bolsa sempre em reais.
 */
export function quoteMapForDisplay(
  quotes: ReadonlyMap<string, Quote>,
  cryptoCurrency: Currency,
  usdBrl: number | null
): Map<string, Quote> {
  const converted = new Map<string, Quote>();

  for (const [key, quote] of quotes) {
    converted.set(key, quoteForDisplay(quote, cryptoCurrency, usdBrl));
  }

  return converted;
}

/** Símbolo textual da moeda para rótulos ("reais", "dólares"). */
export function currencyNoun(currency: Currency): string {
  return currency === 'USD' ? 'dólares' : 'reais';
}
