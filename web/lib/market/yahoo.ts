import { fetchJson, MarketDataError } from './http';
import type {
  AssetSearchResult,
  HistoryPoint,
  MarketRange,
  PriceHistory,
  Quote
} from './types';

/**
 * Yahoo Finance — fonte alternativa de cotações da B3.
 *
 * Entra em cena porque a Brapi passou a exigir token em `/quote/{ticker}`
 * (sem `BRAPI_TOKEN` a resposta é 401) e não faz sentido a tela de mercado
 * ficar vazia por causa de credencial. Yahoo não pede chave.
 *
 * Detalhes do endpoint que importam:
 *  - `chart` devolve cotação **e** histórico no mesmo payload;
 *  - o host `query2` responde quando o `query1` está limitado por rate limit;
 *  - com User-Agent de browser o CDN libera; com UA genérico costuma vir 429.
 */

const YAHOO_HOSTS = ['https://query2.finance.yahoo.com', 'https://query1.finance.yahoo.com'] as const;

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Sufixo do Yahoo para papéis negociados na B3. */
const B3_SUFFIX = '.SA';

const REQUEST_HEADERS: Record<string, string> = { 'user-agent': BROWSER_USER_AGENT };

interface YahooChartMeta {
  currency?: string;
  symbol?: string;
  longName?: string;
  shortName?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  chartPreviousClose?: number;
  regularMarketTime?: number;
}

interface YahooChartResult {
  meta?: YahooChartMeta;
  timestamp?: readonly number[];
  indicators?: { quote?: readonly { close?: readonly (number | null)[] }[] };
}

interface YahooChartResponse {
  chart?: {
    result?: readonly YahooChartResult[] | null;
    error?: { code?: string; description?: string } | null;
  };
}

interface YahooSearchQuote {
  symbol?: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
}

interface YahooSearchResponse {
  quotes?: readonly YahooSearchQuote[];
}

/** Combinação range/interval aceita pelo endpoint `chart`. */
const RANGE_INTERVAL: Record<MarketRange, { range: string; interval: string }> = {
  '1d': { range: '1d', interval: '5m' },
  '5d': { range: '5d', interval: '30m' },
  '1mo': { range: '1mo', interval: '1d' },
  '3mo': { range: '3mo', interval: '1d' },
  '6mo': { range: '6mo', interval: '1d' },
  '1y': { range: '1y', interval: '1d' },
  max: { range: 'max', interval: '1mo' }
};

function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

function toYahooSymbol(ticker: string): string {
  const symbol = normalizeTicker(ticker);

  return symbol.endsWith(B3_SUFFIX) ? symbol : `${symbol}${B3_SUFFIX}`;
}

function fromYahooSymbol(symbol: string): string {
  return normalizeTicker(symbol).replace(/\.SA$/, '');
}

function buildChartUrl(host: string, symbol: string, range: string, interval: string): string {
  const params = new URLSearchParams({ range, interval });

  return `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?${params.toString()}`;
}

/**
 * Consulta o `chart` tentando os hosts em ordem: o primeiro pode estar
 * temporariamente limitado (429) enquanto o segundo responde.
 */
async function fetchChart(
  symbol: string,
  range: string,
  interval: string,
  options: { noStore?: boolean } = {}
): Promise<YahooChartResult> {
  let lastError: MarketDataError | null = null;

  for (const host of YAHOO_HOSTS) {
    try {
      const payload = await fetchJson<YahooChartResponse>(buildChartUrl(host, symbol, range, interval), {
        revalidateSeconds: 60,
        noStore: options.noStore,
        headers: REQUEST_HEADERS
      });

      const result = payload.chart?.result?.[0];

      if (!result) {
        throw new MarketDataError(
          `Ativo "${fromYahooSymbol(symbol)}" não encontrado na fonte de dados.`,
          404
        );
      }

      return result;
    } catch (error) {
      const marketError =
        error instanceof MarketDataError
          ? error
          : new MarketDataError('Não foi possível consultar a fonte de dados.', 502);

      // Ticker inexistente não melhora com outro host.
      if (marketError.status === 404) {
        throw marketError;
      }

      lastError = marketError;
    }
  }

  throw lastError ?? new MarketDataError('Não foi possível consultar a fonte de dados.', 502);
}

function toQuote(result: YahooChartResult, requestedTicker: string): Quote | null {
  const meta = result.meta;
  const price = meta?.regularMarketPrice;

  if (!meta || typeof price !== 'number' || !Number.isFinite(price)) {
    return null;
  }

  const previousClose =
    typeof meta.chartPreviousClose === 'number' && Number.isFinite(meta.chartPreviousClose)
      ? meta.chartPreviousClose
      : null;

  const changePercent =
    typeof meta.regularMarketChangePercent === 'number' && Number.isFinite(meta.regularMarketChangePercent)
      ? meta.regularMarketChangePercent
      : previousClose && previousClose !== 0
        ? ((price - previousClose) / previousClose) * 100
        : 0;

  const ticker = meta.symbol ? fromYahooSymbol(meta.symbol) : normalizeTicker(requestedTicker);

  return {
    ticker,
    assetType: 'stock',
    cryptoId: null,
    name: meta.longName?.trim() || meta.shortName?.trim() || ticker,
    price,
    changePercent,
    changeValue: previousClose !== null ? price - previousClose : 0,
    previousClose,
    currency: 'BRL',
    logoUrl: `https://icons.brapi.dev/icons/${ticker}.svg`,
    updatedAt:
      typeof meta.regularMarketTime === 'number'
        ? new Date(meta.regularMarketTime * 1000).toISOString()
        : new Date().toISOString()
  };
}

/**
 * Cotações de um ou vários ativos da B3. O endpoint `chart` é por símbolo,
 * então as chamadas saem em paralelo; tickers inexistentes são omitidos.
 */
export async function getYahooQuotes(
  tickers: readonly string[],
  options: { noStore?: boolean } = {}
): Promise<Quote[]> {
  const symbols = Array.from(new Set(tickers.map(toYahooSymbol).filter((symbol) => symbol.length > 0)));

  if (symbols.length === 0) {
    return [];
  }

  const settled = await Promise.allSettled(
    symbols.map((symbol) =>
      fetchChart(symbol, '1d', '1d', options).then((result) => toQuote(result, symbol))
    )
  );

  const quotes: Quote[] = [];

  for (const entry of settled) {
    if (entry.status === 'fulfilled' && entry.value) {
      quotes.push(entry.value);
    }
  }

  return quotes;
}

function toHistoryPoints(result: YahooChartResult): HistoryPoint[] {
  const timestamps = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const points: HistoryPoint[] = [];

  for (let index = 0; index < timestamps.length; index += 1) {
    const seconds = timestamps[index];
    const price = closes[index];

    if (typeof seconds !== 'number' || typeof price !== 'number' || !Number.isFinite(price)) {
      continue;
    }

    points.push({ timestamp: seconds * 1000, price });
  }

  return points.sort((a, b) => a.timestamp - b.timestamp);
}

/** Histórico de preços de um ativo da B3. */
export async function getYahooHistory(
  ticker: string,
  range: MarketRange,
  options: { noStore?: boolean } = {}
): Promise<PriceHistory> {
  const symbol = toYahooSymbol(ticker);
  const { range: yahooRange, interval } = RANGE_INTERVAL[range];

  let result: YahooChartResult;

  try {
    result = await fetchChart(symbol, yahooRange, interval, options);
  } catch (error) {
    // Intervalos intradiários têm janela curta no Yahoo; cai para diário.
    if (interval === '1d') {
      throw error;
    }

    result = await fetchChart(symbol, yahooRange, '1d', options);
  }

  return {
    ticker: fromYahooSymbol(symbol),
    assetType: 'stock',
    cryptoId: null,
    currency: 'BRL',
    points: toHistoryPoints(result)
  };
}

/** Busca ações da B3 por nome ou ticker. */
export async function searchYahooStocks(query: string, limit = 10): Promise<AssetSearchResult[]> {
  const trimmed = query.trim();

  if (trimmed.length < 2) {
    return [];
  }

  const params = new URLSearchParams({
    q: trimmed,
    quotesCount: String(limit * 2),
    newsCount: '0'
  });

  const payload = await fetchJson<YahooSearchResponse>(
    `${YAHOO_HOSTS[0]}/v1/finance/search?${params.toString()}`,
    { revalidateSeconds: 600, headers: REQUEST_HEADERS }
  );

  const results: AssetSearchResult[] = [];

  for (const quote of payload.quotes ?? []) {
    const symbol = quote.symbol?.toUpperCase();

    // Só B3: o Yahoo devolve também listagens nos EUA (PBR, XPBR.MC…).
    if (!symbol || !symbol.endsWith(B3_SUFFIX) || quote.quoteType !== 'EQUITY') {
      continue;
    }

    const ticker = fromYahooSymbol(symbol);

    results.push({
      ticker,
      assetType: 'stock',
      cryptoId: null,
      name: quote.longname?.trim() || quote.shortname?.trim() || ticker,
      logoUrl: `https://icons.brapi.dev/icons/${ticker}.svg`
    });

    if (results.length >= limit) {
      break;
    }
  }

  return results;
}
