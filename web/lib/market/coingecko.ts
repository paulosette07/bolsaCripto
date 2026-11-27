import { planCryptoCurrency, scaleCryptoAmount } from './crypto-currency';
import { fetchJson, MarketDataError } from './http';
import type {
  AssetSearchResult,
  Currency,
  HistoryPoint,
  MarketRange,
  PriceHistory,
  Quote
} from './types';

/**
 * CoinGecko — criptomoedas em BRL.
 *
 * Funciona sem API key na API pública (rate limit apertado). Para uso intenso,
 * defina COINGECKO_API_KEY e o header `x-cg-demo-api-key` é enviado.
 */

const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';
const coingeckoApiKey = process.env.COINGECKO_API_KEY ?? '';

/**
 * Mapa offline de ticker comum -> id canônico da CoinGecko.
 * Evita um round-trip de busca a cada cotação. Tickers fora daqui caem no
 * endpoint /search automaticamente.
 */
const POPULAR_COINS: Readonly<Record<string, string>> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  XRP: 'ripple',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  BNB: 'binancecoin',
  LTC: 'litecoin',
  BCH: 'bitcoin-cash',
  DOT: 'polkadot',
  MATIC: 'matic-network',
  POL: 'polygon-ecosystem-token',
  AVAX: 'avalanche-2',
  LINK: 'chainlink',
  UNI: 'uniswap',
  ATOM: 'cosmos',
  XLM: 'stellar',
  ALGO: 'algorand',
  VET: 'vechain',
  NEAR: 'near',
  APT: 'aptos',
  ARB: 'arbitrum',
  OP: 'optimism',
  SUI: 'sui',
  TON: 'the-open-network',
  SHIB: 'shiba-inu',
  TRX: 'tron',
  EOS: 'eos',
  ETC: 'ethereum-classic',
  FIL: 'filecoin',
  ICP: 'internet-computer',
  HBAR: 'hedera-hashgraph',
  INJ: 'injective-protocol',
  RENDER: 'render-token',
  IMX: 'immutable-x',
  GRT: 'the-graph',
  AAVE: 'aave',
  MKR: 'maker',
  CRV: 'curve-dao-token',
  SAND: 'the-sandbox',
  MANA: 'decentraland',
  AXS: 'axie-infinity',
  CHZ: 'chiliz',
  GALA: 'gala',
  PEPE: 'pepe',
  WIF: 'dogwifcoin',
  BONK: 'bonk',
  USDT: 'tether',
  USDC: 'usd-coin',
  DAI: 'dai'
};

/** Dias por range. `max` tenta o máximo e cai para 365 se a API recusar. */
const RANGE_TO_DAYS: Record<MarketRange, string> = {
  '1d': '1',
  '5d': '7',
  '1mo': '30',
  '3mo': '90',
  '6mo': '180',
  '1y': '365',
  max: 'max'
};

const MAX_HISTORY_POINTS = 400;

/** Reais são a moeda padrão do app; dólar é opt-in na área de cripto. */
const DEFAULT_CURRENCY: Currency = 'BRL';

/**
 * Quanto tempo uma resposta antiga ainda pode ser servida quando a fonte
 * responde 429/5xx. A API pública da CoinGecko limita por IP e,
 * no servidor, todos os usuários saem pelo mesmo IP — servir o último preço
 * bom (com o horário real de atualização no rodapé) é melhor do que trocar a
 * cotação por uma caixa de erro.
 */
const STALE_FALLBACK_MS = 15 * 60 * 1000;

/** Teto do cache em memória, para não crescer sem limite numa instância viva. */
const MAX_STALE_ENTRIES = 200;

interface StaleEntry {
  storedAt: number;
  payload: unknown;
}

const staleByUrl = new Map<string, StaleEntry>();

export interface CryptoQuoteOptions {
  noStore?: boolean;
  /** Moeda de exibição do preço. Padrão: BRL. */
  currency?: Currency;
}

interface MarketChartResponse {
  prices?: [number, number][];
}

interface CoinMarketItem {
  id?: string;
  symbol?: string;
  name?: string;
  image?: string;
  current_price?: number;
  price_change_24h?: number;
  price_change_percentage_24h?: number;
  last_updated?: string;
}

interface SearchResponse {
  coins?: {
    id?: string;
    name?: string;
    symbol?: string;
    large?: string;
    thumb?: string;
    market_cap_rank?: number;
  }[];
}

function requestHeaders(): Record<string, string> {
  return coingeckoApiKey ? { 'x-cg-demo-api-key': coingeckoApiKey } : {};
}

/** Falha que vale a pena cobrir com a última resposta boa (rate limit / queda). */
function isRecoverableFailure(error: unknown): boolean {
  if (error instanceof MarketDataError) {
    // 404 é dado ausente de verdade: servir cache antigo esconderia o problema.
    return error.status === 429 || error.status >= 500;
  }

  return true;
}

function rememberResponse(url: string, payload: unknown): void {
  if (staleByUrl.size >= MAX_STALE_ENTRIES) {
    const oldestKey = staleByUrl.keys().next().value;

    if (oldestKey !== undefined) {
      staleByUrl.delete(oldestKey);
    }
  }

  staleByUrl.set(url, { storedAt: Date.now(), payload });
}

function recallResponse<T>(url: string): T | null {
  const entry = staleByUrl.get(url);

  if (!entry || Date.now() - entry.storedAt > STALE_FALLBACK_MS) {
    return null;
  }

  return entry.payload as T;
}

/**
 * Chamada à CoinGecko com dois níveis de proteção.
 *
 * 1. `fetchJson` repete uma vez quando a fonte responde 429/503 — rajadas
 *    curtas são o modo normal de falha da API pública.
 * 2. Se ainda assim falhar, servimos a última resposta boa da mesma URL (até
 *    15 min). Cripto não pode sumir da carteira porque o provedor limitou a
 *    consulta; o horário real da cotação continua visível no rodapé.
 */
async function fetchCoinGecko<T>(url: string, revalidateSeconds: number, noStore: boolean): Promise<T> {
  const headers = requestHeaders();

  try {
    const payload = await fetchJson<T>(url, {
      revalidateSeconds,
      noStore,
      ...(Object.keys(headers).length > 0 ? { headers } : {})
    });

    rememberResponse(url, payload);

    return payload;
  } catch (error) {
    const stale = recallResponse<T>(url);

    if (stale !== null && isRecoverableFailure(error)) {
      return stale;
    }

    throw error;
  }
}

/** Resolve o id canônico a partir do ticker, usando o mapa e depois a busca. */
export async function resolveCryptoId(ticker: string): Promise<string | null> {
  const symbol = ticker.trim().toUpperCase();

  if (symbol.length === 0) {
    return null;
  }

  const known = POPULAR_COINS[symbol];

  if (known) {
    return known;
  }

  const results = await searchCrypto(symbol, 5);
  const exact = results.find((item) => item.ticker.toUpperCase() === symbol);

  return exact?.cryptoId ?? results[0]?.cryptoId ?? null;
}

function toQuote(item: CoinMarketItem, currency: Currency, factor: number): Quote | null {
  const cryptoId = item.id;
  const price = item.current_price;

  if (!cryptoId || typeof price !== 'number' || !Number.isFinite(price)) {
    return null;
  }

  return {
    ticker: (item.symbol ?? cryptoId).toUpperCase(),
    assetType: 'crypto',
    cryptoId,
    name: item.name?.trim() || cryptoId,
    price: scaleCryptoAmount(price, factor),
    // Percentual é adimensional: converter preço e variação absoluta já basta.
    changePercent: item.price_change_percentage_24h ?? 0,
    changeValue: scaleCryptoAmount(item.price_change_24h ?? 0, factor),
    previousClose: null,
    currency,
    logoUrl: item.image ?? null,
    updatedAt: item.last_updated ?? new Date().toISOString()
  };
}

/** Cotações de uma ou várias criptos, por id canônico, na moeda pedida. */
export async function getCryptoQuotes(
  cryptoIds: readonly string[],
  options: CryptoQuoteOptions = {}
): Promise<Quote[]> {
  const ids = Array.from(new Set(cryptoIds.map((id) => id.trim().toLowerCase()).filter(Boolean)));

  if (ids.length === 0) {
    return [];
  }

  const currency = options.currency ?? DEFAULT_CURRENCY;
  const plan = await planCryptoCurrency(currency);

  const url = `${COINGECKO_BASE_URL}/coins/markets?vs_currency=${plan.vsCurrency.toLowerCase()}&ids=${encodeURIComponent(
    ids.join(',')
  )}&price_change_percentage=24h&sparkline=false`;

  const items = await fetchCoinGecko<CoinMarketItem[]>(url, 60, options.noStore ?? false);

  return items
    .map((item) => toQuote(item, currency, plan.factor))
    .filter((quote): quote is Quote => quote !== null);
}

function downsample(points: HistoryPoint[], limit: number): HistoryPoint[] {
  if (points.length <= limit) {
    return points;
  }

  const step = points.length / limit;
  const sampled: HistoryPoint[] = [];

  for (let index = 0; index < limit; index += 1) {
    const point = points[Math.floor(index * step)];

    if (point) {
      sampled.push(point);
    }
  }

  const lastPoint = points[points.length - 1];

  if (lastPoint && sampled[sampled.length - 1]?.timestamp !== lastPoint.timestamp) {
    sampled.push(lastPoint);
  }

  return sampled;
}

async function fetchMarketChart(
  cryptoId: string,
  days: string,
  vsCurrency: Currency,
  factor: number,
  noStore: boolean
): Promise<HistoryPoint[]> {
  const url = `${COINGECKO_BASE_URL}/coins/${encodeURIComponent(
    cryptoId
  )}/market_chart?vs_currency=${vsCurrency.toLowerCase()}&days=${days}`;

  const payload = await fetchCoinGecko<MarketChartResponse>(url, 300, noStore);

  const points: HistoryPoint[] = [];

  for (const entry of payload.prices ?? []) {
    const timestamp = entry[0];
    const price = entry[1];

    if (Number.isFinite(timestamp) && Number.isFinite(price)) {
      points.push({ timestamp, price: scaleCryptoAmount(price, factor) });
    }
  }

  return points.sort((a, b) => a.timestamp - b.timestamp);
}

/** Histórico de preços de uma cripto, por id canônico, na moeda pedida. */
export async function getCryptoHistory(
  cryptoId: string,
  range: MarketRange,
  options: CryptoQuoteOptions = {}
): Promise<PriceHistory> {
  const id = cryptoId.trim().toLowerCase();
  const noStore = options.noStore ?? false;
  const currency = options.currency ?? DEFAULT_CURRENCY;
  const days = RANGE_TO_DAYS[range];
  const plan = await planCryptoCurrency(currency);

  let points: HistoryPoint[];

  try {
    points = await fetchMarketChart(id, days, plan.vsCurrency, plan.factor, noStore);
  } catch (error) {
    if (days === 'max') {
      // Plano público limita a janela histórica; cai para 1 ano.
      points = await fetchMarketChart(id, '365', plan.vsCurrency, plan.factor, noStore);
    } else {
      throw error;
    }
  }

  return {
    ticker: id.toUpperCase(),
    assetType: 'crypto',
    cryptoId: id,
    currency,
    points: downsample(points, MAX_HISTORY_POINTS)
  };
}

/** Busca de criptos por nome ou símbolo. */
export async function searchCrypto(query: string, limit = 8): Promise<AssetSearchResult[]> {
  const trimmed = query.trim();

  if (trimmed.length < 1) {
    return [];
  }

  const url = `${COINGECKO_BASE_URL}/search?query=${encodeURIComponent(trimmed)}`;
  const payload = await fetchCoinGecko<SearchResponse>(url, 300, false);

  const results: AssetSearchResult[] = [];

  for (const coin of (payload.coins ?? []).slice(0, limit)) {
    const cryptoId = coin.id;
    const symbol = coin.symbol?.toUpperCase();

    if (!cryptoId || !symbol) {
      continue;
    }

    results.push({
      ticker: symbol,
      assetType: 'crypto',
      cryptoId,
      name: coin.name?.trim() || cryptoId,
      logoUrl: coin.large ?? coin.thumb ?? null
    });
  }

  return results;
}
