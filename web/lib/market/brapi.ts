import { brapiToken } from '@/lib/env';

import { fetchJson, MarketDataError } from './http';
import type { HistoryPoint, MarketRange, PriceHistory, Quote } from './types';

/**
 * Brapi (https://brapi.dev) — cotações da B3.
 *
 * Funciona sem token, com rate limit baixo. Se `BRAPI_TOKEN` estiver definido,
 * entra como query param e amplia o limite.
 */

const BRAPI_BASE_URL = 'https://brapi.dev/api';

interface BrapiHistoricalPoint {
  date?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  adjustedClose?: number;
}

interface BrapiQuoteResult {
  symbol?: string;
  shortName?: string;
  longName?: string;
  currency?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketPreviousClose?: number;
  regularMarketTime?: string;
  logourl?: string;
  historicalDataPrice?: BrapiHistoricalPoint[];
}

interface BrapiResponse {
  results?: BrapiQuoteResult[];
  error?: boolean;
  message?: string;
}

/** Combinação range/interval aceita pela Brapi. */
const BRAPI_RANGE_INTERVAL: Record<MarketRange, { range: string; interval: string }> = {
  '1d': { range: '1d', interval: '5m' },
  '5d': { range: '5d', interval: '1h' },
  '1mo': { range: '1mo', interval: '1d' },
  '3mo': { range: '3mo', interval: '1d' },
  '6mo': { range: '6mo', interval: '1d' },
  '1y': { range: '1y', interval: '1d' },
  max: { range: 'max', interval: '1mo' }
};

function withToken(url: string): string {
  if (!brapiToken) {
    return url;
  }

  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(brapiToken)}`;
}

function assertNoBrapiError(payload: BrapiResponse): void {
  if (payload.error) {
    throw new MarketDataError(payload.message ?? 'A Brapi recusou a consulta.', 400);
  }
}

function toQuote(result: BrapiQuoteResult): Quote | null {
  const ticker = result.symbol?.trim().toUpperCase();
  const price = result.regularMarketPrice;

  if (!ticker || typeof price !== 'number' || !Number.isFinite(price)) {
    return null;
  }

  const changePercent = result.regularMarketChangePercent ?? 0;
  const previousClose = result.regularMarketPreviousClose ?? null;
  const changeValue =
    typeof result.regularMarketChange === 'number'
      ? result.regularMarketChange
      : previousClose !== null
        ? price - previousClose
        : 0;

  return {
    ticker,
    assetType: 'stock',
    cryptoId: null,
    name: result.longName?.trim() || result.shortName?.trim() || ticker,
    price,
    changePercent,
    changeValue,
    previousClose,
    currency: 'BRL',
    logoUrl: result.logourl ?? `https://icons.brapi.dev/icons/${ticker}.svg`,
    updatedAt: result.regularMarketTime ?? new Date().toISOString()
  };
}

/**
 * Cotações de um ou vários ativos da B3 em uma única chamada.
 * Tickers inexistentes são simplesmente omitidos do resultado.
 */
export async function getBrapiQuotes(
  tickers: readonly string[],
  options: { noStore?: boolean } = {}
): Promise<Quote[]> {
  const symbols = Array.from(
    new Set(
      tickers
        .map((ticker) => ticker.trim().toUpperCase())
        .filter((ticker) => ticker.length > 0)
    )
  );

  if (symbols.length === 0) {
    return [];
  }

  const url = withToken(`${BRAPI_BASE_URL}/quote/${encodeURIComponent(symbols.join(','))}`);
  const payload = await fetchJson<BrapiResponse>(url, {
    revalidateSeconds: 60,
    noStore: options.noStore
  });

  assertNoBrapiError(payload);

  const quotes = (payload.results ?? [])
    .map(toQuote)
    .filter((quote): quote is Quote => quote !== null);

  return quotes;
}

function toHistoryPoints(points: readonly BrapiHistoricalPoint[]): HistoryPoint[] {
  const result: HistoryPoint[] = [];

  for (const point of points) {
    const seconds = point.date;
    const price = point.close ?? point.adjustedClose;

    if (typeof seconds !== 'number' || typeof price !== 'number' || !Number.isFinite(price)) {
      continue;
    }

    result.push({ timestamp: seconds * 1000, price });
  }

  return result.sort((a, b) => a.timestamp - b.timestamp);
}

/** Histórico de preços de um ativo da B3. */
export async function getBrapiHistory(
  ticker: string,
  range: MarketRange,
  options: { noStore?: boolean } = {}
): Promise<PriceHistory> {
  const symbol = ticker.trim().toUpperCase();
  const { range: brapiRange, interval } = BRAPI_RANGE_INTERVAL[range];

  const buildUrl = (usedInterval: string) =>
    withToken(
      `${BRAPI_BASE_URL}/quote/${encodeURIComponent(symbol)}?range=${brapiRange}&interval=${usedInterval}`
    );

  const fetchHistory = async (usedInterval: string) => {
    const payload = await fetchJson<BrapiResponse>(buildUrl(usedInterval), {
      revalidateSeconds: 120,
      noStore: options.noStore
    });

    assertNoBrapiError(payload);

    return payload.results?.[0]?.historicalDataPrice ?? [];
  };

  let rawPoints: BrapiHistoricalPoint[];

  try {
    rawPoints = await fetchHistory(interval);
  } catch (error) {
    // Se a combinação range/interval não for aceita, cai para diário.
    if (interval === '1d') {
      throw error;
    }

    rawPoints = await fetchHistory('1d');
  }

  return {
    ticker: symbol,
    assetType: 'stock',
    cryptoId: null,
    currency: 'BRL',
    points: toHistoryPoints(rawPoints)
  };
}
