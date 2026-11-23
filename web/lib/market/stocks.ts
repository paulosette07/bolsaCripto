import { brapiToken } from '@/lib/env';

import { getBrapiHistory, getBrapiQuotes } from './brapi';
import { MarketDataError } from './http';
import type { AssetSearchResult, MarketRange, PriceHistory, Quote } from './types';
import { getYahooHistory, getYahooQuotes, searchYahooStocks } from './yahoo';

/**
 * Escolha do provider de ações/FIIs da B3.
 *
 * A Brapi passou a exigir token em `/quote/{ticker}` (HTTP 401 sem
 * `BRAPI_TOKEN`), enquanto o Yahoo atende sem credencial. Em vez de amarrar a
 * tela a uma credencial, a regra é:
 *
 *  - com `BRAPI_TOKEN`: Brapi primeiro, Yahoo se ela falhar;
 *  - sem `BRAPI_TOKEN`: vai direto no Yahoo, sem gastar uma chamada fadada ao 401.
 *
 * O resto da aplicação continua falando só com a fachada `lib/market`.
 */

const UNAVAILABLE_MESSAGE = 'Não foi possível consultar a B3 agora. Tente novamente em instantes.';

function hasBrapiToken(): boolean {
  return brapiToken.trim().length > 0;
}

function toMarketError(primaryError: unknown): MarketDataError {
  if (primaryError instanceof MarketDataError && primaryError.status === 404) {
    return primaryError;
  }

  return new MarketDataError(UNAVAILABLE_MESSAGE, 502);
}

/** Executa o provider principal e, se ele falhar, o alternativo. */
async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>
): Promise<T> {
  try {
    return await primary();
  } catch (primaryError) {
    try {
      return await fallback();
    } catch {
      throw toMarketError(primaryError);
    }
  }
}

/** Cotações de um ou vários ativos da B3. */
export async function getStockQuotes(
  tickers: readonly string[],
  options: { noStore?: boolean } = {}
): Promise<Quote[]> {
  if (!hasBrapiToken()) {
    return getYahooQuotes(tickers, options);
  }

  return withFallback(
    () => getBrapiQuotes(tickers, options),
    () => getYahooQuotes(tickers, options)
  );
}

/** Histórico de preços de um ativo da B3. */
export async function getStockHistory(
  ticker: string,
  range: MarketRange,
  options: { noStore?: boolean } = {}
): Promise<PriceHistory> {
  if (!hasBrapiToken()) {
    return getYahooHistory(ticker, range, options);
  }

  return withFallback(
    () => getBrapiHistory(ticker, range, options),
    () => getYahooHistory(ticker, range, options)
  );
}

const BRAPI_BASE_URL = 'https://brapi.dev/api';
const MAX_SEARCH_RESULTS = 10;

interface BrapiStockListItem {
  stock?: string;
  name?: string;
  logo?: string;
}

interface BrapiStockListResponse {
  stocks?: BrapiStockListItem[];
  error?: boolean;
}

/** Busca na Brapi (endpoint de lista continua aberto) — silenciosa em erro. */
async function searchBrapiStocks(query: string): Promise<AssetSearchResult[]> {
  const params = new URLSearchParams({
    search: query,
    limit: String(MAX_SEARCH_RESULTS)
  });

  const response = await fetch(`${BRAPI_BASE_URL}/quote/list?${params.toString()}`, {
    headers: { accept: 'application/json' },
    next: { revalidate: 600 }
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as BrapiStockListResponse;

  if (payload.error) {
    return [];
  }

  const results: AssetSearchResult[] = [];

  for (const item of payload.stocks ?? []) {
    const ticker = item.stock?.trim().toUpperCase();

    if (!ticker) {
      continue;
    }

    results.push({
      ticker,
      assetType: 'stock',
      cryptoId: null,
      name: item.name?.trim() || ticker,
      logoUrl: item.logo ?? `https://icons.brapi.dev/icons/${ticker}.svg`
    });
  }

  return results;
}

/**
 * Busca ações/FIIs por nome ou ticker.
 *
 * As duas fontes rodam em paralelo e o resultado é unido: se uma estiver
 * limitada, a outra cobre. Ticker repetido mantém a primeira ocorrência.
 */
export async function searchStocks(query: string): Promise<AssetSearchResult[]> {
  const trimmed = query.trim();

  if (trimmed.length < 2) {
    return [];
  }

  const [brapiResults, yahooResults] = await Promise.all([
    searchBrapiStocks(trimmed).catch(() => [] as AssetSearchResult[]),
    searchYahooStocks(trimmed, MAX_SEARCH_RESULTS).catch(() => [] as AssetSearchResult[])
  ]);

  const merged = new Map<string, AssetSearchResult>();

  for (const result of [...yahooResults, ...brapiResults]) {
    if (!merged.has(result.ticker)) {
      merged.set(result.ticker, result);
    }
  }

  return [...merged.values()].slice(0, MAX_SEARCH_RESULTS);
}
