import { getUsdBrlRate } from './fx';
import type { Currency } from './types';

/**
 * Moeda em que a CoinGecko é consultada.
 *
 * Cripto é cotada em real *e* em dólar, mas pedir as duas versões à fonte
 * dobra o consumo da API pública — e a troca de moeda na tela virava uma
 * enxurrada de requisições que terminava em HTTP 429. Por isso a fonte é
 * consultada **sempre na mesma moeda** e a outra é derivada localmente com o
 * câmbio do dia (BCB/Yahoo). O resultado também fica mais coerente: preço e
 * gráfico na mesma taxa, em vez de duas conversões independentes.
 */
export const CRYPTO_UPSTREAM_CURRENCY: Currency = 'BRL';

/**
 * Dólar comercial. Fica isolado aqui para que `planCryptoCurrency` continue
 * puro em relação ao resto do app e fácil de testar.
 */
async function currentUsdBrl(): Promise<number | null> {
  const rate = await getUsdBrlRate();

  return typeof rate.rate === 'number' && Number.isFinite(rate.rate) && rate.rate > 0
    ? rate.rate
    : null;
}

export interface CryptoCurrencyPlan {
  /** Moeda que realmente vai na URL da fonte. */
  vsCurrency: Currency;
  /**
   * Multiplicador aplicado aos números devolvidos pela fonte para chegar na
   * moeda pedida. `1` quando a fonte já responde na moeda final.
   */
  factor: number;
}

/**
 * Decide como atender um pedido de cripto na moeda `target`.
 *
 * Sem câmbio disponível a conversão é impossível: nesse caso — e só nele — a
 * fonte é consultada diretamente na moeda final, porque exibir um valor
 * convertido por uma taxa inventada seria pior do que uma requisição extra.
 */
export async function planCryptoCurrency(target: Currency): Promise<CryptoCurrencyPlan> {
  if (target === CRYPTO_UPSTREAM_CURRENCY) {
    return { vsCurrency: CRYPTO_UPSTREAM_CURRENCY, factor: 1 };
  }

  const rate = await currentUsdBrl();

  if (rate === null) {
    return { vsCurrency: target, factor: 1 };
  }

  // Reais -> dólares: divide pela taxa (quantos reais vale 1 dólar).
  return { vsCurrency: CRYPTO_UPSTREAM_CURRENCY, factor: 1 / rate };
}

/** Aplica o fator de conversão a um valor; `NaN`/`Infinity` viram 0. */
export function scaleCryptoAmount(value: number, factor: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const scaled = value * factor;

  return Number.isFinite(scaled) ? scaled : 0;
}
