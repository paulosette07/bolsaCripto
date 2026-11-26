import { getYahooSnapshot } from './yahoo';

/**
 * Câmbio USD/BRL.
 *
 * Toda a aplicação negocia em duas moedas: a B3 em reais, cripto em dólar
 * (nativo). Para somar as duas numa única carteira é preciso uma taxa — e ela
 * não pode vir de um número fixo, senão o patrimônio em dólar envelhece junto
 * do código.
 *
 * Fontes, em ordem:
 *  1. **BCB SGS 10813** — dólar comercial (venda), oficial e sem chave;
 *  2. **Yahoo `BRL=X`** — quando o BCB não publica (fim de semana sem PTAX,
 *     API fora do ar).
 *
 * Se as duas falharem devolvemos `null` e quem chama mostra o valor sem
 * conversão — nunca inventamos uma taxa.
 */

export interface UsdBrlRate {
  /** Quantos reais vale 1 dólar. `null` quando nenhuma fonte respondeu. */
  rate: number | null;
  /** Data de referência (ISO `YYYY-MM-DD`) quando a fonte informa. */
  referenceDate: string | null;
  source: 'bcb' | 'yahoo' | 'none';
  fetchedAt: string;
}

interface BcbPoint {
  data?: string;
  valor?: string;
}

const BCB_USD_SELL_SERIES = 10813;
const BCB_URL = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${BCB_USD_SELL_SERIES}/dados/ultimos/1?formato=json`;

/** `25/11/2026` -> `2026-11-25`. */
function bcbDateToIso(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());

  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

function isPlausibleRate(value: unknown): value is number {
  // Dólar entre 1 e 20 reais: qualquer coisa fora disso é erro de parsing.
  return typeof value === 'number' && Number.isFinite(value) && value > 1 && value < 20;
}

async function fetchFromBcb(): Promise<{ rate: number; referenceDate: string | null } | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(BCB_URL, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
      next: { revalidate: 1800 }
    });

    if (!response.ok) {
      return null;
    }

    const points = (await response.json()) as BcbPoint[];
    const latest = points[points.length - 1];
    const parsed = latest?.valor ? Number.parseFloat(latest.valor) : Number.NaN;

    if (!isPlausibleRate(parsed)) {
      return null;
    }

    return { rate: parsed, referenceDate: bcbDateToIso(latest?.data) };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchFromYahoo(): Promise<{ rate: number; referenceDate: string | null } | null> {
  try {
    const snapshot = await getYahooSnapshot('BRL=X');

    if (!isPlausibleRate(snapshot.price)) {
      return null;
    }

    return {
      rate: snapshot.price,
      referenceDate: snapshot.updatedAt.slice(0, 10)
    };
  } catch {
    return null;
  }
}

/** Taxa de câmbio USD -> BRL. Falha das duas fontes devolve `rate: null`. */
export async function getUsdBrlRate(): Promise<UsdBrlRate> {
  const fetchedAt = new Date().toISOString();

  const bcb = await fetchFromBcb();

  if (bcb) {
    return { rate: bcb.rate, referenceDate: bcb.referenceDate, source: 'bcb', fetchedAt };
  }

  const yahoo = await fetchFromYahoo();

  if (yahoo) {
    return { rate: yahoo.rate, referenceDate: yahoo.referenceDate, source: 'yahoo', fetchedAt };
  }

  return { rate: null, referenceDate: null, source: 'none', fetchedAt };
}
