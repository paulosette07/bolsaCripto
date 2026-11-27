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
 *
 * A taxa também alimenta a faixa fixa de dólar do topo do app (web e desktop),
 * por isso a resposta traz a variação contra o ponto anterior da mesma série.
 */

export interface UsdBrlRate {
  /** Quantos reais vale 1 dólar. `null` quando nenhuma fonte respondeu. */
  rate: number | null;
  /** Ponto anterior da série, base da variação. `null` quando não há. */
  previousRate: number | null;
  /** Variação percentual contra `previousRate`. `null` sem base de comparação. */
  changePercent: number | null;
  /** Data de referência (ISO `YYYY-MM-DD`) quando a fonte informa. */
  referenceDate: string | null;
  source: 'bcb' | 'yahoo' | 'none';
  /** Momento da consulta, em ISO. */
  fetchedAt: string;
}

interface BcbPoint {
  data?: string;
  valor?: string;
}

const BCB_USD_SELL_SERIES = 10813;

/**
 * Dois pontos: o último é a taxa do dia, o penúltimo serve de base para a
 * variação. Uma chamada só, sem inventar comparação com um número fixo.
 */
const BCB_URL = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${BCB_USD_SELL_SERIES}/dados/ultimos/2?formato=json`;

/**
 * 5 minutos — a mesma cadência do refresh das telas. Um pouco abaixo disso no
 * cache evita servir um valor recém-vencido bem quando o cliente pergunta.
 */
const FX_REVALIDATE_SECONDS = 240;

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

function parseBcbValue(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  // O BCB publica "5,7487" (vírgula decimal).
  const parsed = Number.parseFloat(value.trim().replace(',', '.'));

  return isPlausibleRate(parsed) ? parsed : null;
}

/** Variação percentual entre o ponto atual e o anterior. */
function percentChange(current: number, previous: number | null): number | null {
  if (previous === null || previous <= 0) {
    return null;
  }

  return ((current - previous) / previous) * 100;
}

interface SourceRate {
  rate: number;
  previousRate: number | null;
  referenceDate: string | null;
}

async function fetchFromBcb(): Promise<SourceRate | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(BCB_URL, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
      next: { revalidate: FX_REVALIDATE_SECONDS }
    });

    if (!response.ok) {
      return null;
    }

    const points = (await response.json()) as BcbPoint[];

    if (!Array.isArray(points) || points.length === 0) {
      return null;
    }

    const latest = points[points.length - 1];
    const rate = parseBcbValue(latest?.valor);

    if (rate === null) {
      return null;
    }

    // Fim de semana/feriado: o BCB devolve um ponto só e não há base de variação.
    const previous = points.length > 1 ? parseBcbValue(points[points.length - 2]?.valor) : null;

    return { rate, previousRate: previous, referenceDate: bcbDateToIso(latest?.data) };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchFromYahoo(): Promise<SourceRate | null> {
  try {
    const snapshot = await getYahooSnapshot('BRL=X');

    if (!isPlausibleRate(snapshot.price)) {
      return null;
    }

    return {
      rate: snapshot.price,
      previousRate:
        typeof snapshot.previousClose === 'number' && isPlausibleRate(snapshot.previousClose)
          ? snapshot.previousClose
          : null,
      referenceDate: snapshot.updatedAt.slice(0, 10)
    };
  } catch {
    return null;
  }
}

/**
 * Taxa de câmbio USD -> BRL com a variação do dia.
 * Falha das duas fontes devolve `rate: null`.
 */
export async function getUsdBrlRate(): Promise<UsdBrlRate> {
  const fetchedAt = new Date().toISOString();

  const bcb = await fetchFromBcb();

  if (bcb) {
    return {
      rate: bcb.rate,
      previousRate: bcb.previousRate,
      changePercent: percentChange(bcb.rate, bcb.previousRate),
      referenceDate: bcb.referenceDate,
      source: 'bcb',
      fetchedAt
    };
  }

  const yahoo = await fetchFromYahoo();

  if (yahoo) {
    return {
      rate: yahoo.rate,
      previousRate: yahoo.previousRate,
      changePercent: percentChange(yahoo.rate, yahoo.previousRate),
      referenceDate: yahoo.referenceDate,
      source: 'yahoo',
      fetchedAt
    };
  }

  return {
    rate: null,
    previousRate: null,
    changePercent: null,
    referenceDate: null,
    source: 'none',
    fetchedAt
  };
}
