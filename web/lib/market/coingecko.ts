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

function withApiKey(url: string): string {
  return url;
}

function requestHeaders(): Record<string, string> {
  return coingeckoApiKey ? { 'x-cg-demo-api-key': coingeckoApiKey } : {};
}

/**
 * `fetchJson` já monta os headers padrão; para o header da CoinGecko usamos
 * uma URL com chave apenas quando necessário. Mantido separado para deixar
 * explícito que o provider funciona sem credencial.
 */
async function fetchCoinGecko<T>(url: string, revalidateSeconds: number, noStore: boolean): Promise<T> {
  const headers = requestHeaders();

  if (Object.keys(headers).length === 0) {
    return fetchJson<T>(withApiKey(url), { revalidateSeconds, noStore });
  }

  // Caminho com API key: fetch direto com o header extra.
  const response = await fetch(url, {
    headers: { accept: 'application/json', ...headers },
    ...(noStore ? { cache: 'no-store' as const } : { next: { revalidate: revalidateSeconds } })
  });

  if (!response.ok) {
    throw new MarketDataError(
      `CoinGecko respondeu HTTP ${response.status}. Tente novamente em instantes.`,
      response.status
    );
  }

  return (await response.json()) as T;
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

function toQuote(item: CoinMarketItem, currency: Currency): Quote | null {
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
    price,
    changePercent: item.price_change_percentage_24h ?? 0,
    changeValue: item.price_change_24h ?? 0,
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

  const url = `${COINGECKO_BASE_URL}/coins/markets?vs_currency=${currency.toLowerCase()}&ids=${encodeURIComponent(
    ids.join(',')
  )}&price_change_percentage=24h&sparkline=false`;

  const items = await fetchCoinGecko<CoinMarketItem[]>(url, 60, options.noStore ?? false);

  return items
    .map((item) => toQuote(item, currency))
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
  noStore: boolean,
  currency: Currency
): Promise<HistoryPoint[]> {
  const url = `${COINGECKO_BASE_URL}/coins/${encodeURIComponent(
    cryptoId
  )}/market_chart?vs_currency=${currency.toLowerCase()}&days=${days}`;

  const payload = await fetchCoinGecko<MarketChartResponse>(url, 300, noStore);

  const points: HistoryPoint[] = [];

  for (const entry of payload.prices ?? []) {
    const timestamp = entry[0];
    const price = entry[1];

    if (Number.isFinite(timestamp) && Number.isFinite(price)) {
      points.push({ timestamp, price });
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

  let points: HistoryPoint[];

  try {
    points = await fetchMarketChart(id, days, noStore, currency);
  } catch (error) {
    if (days === 'max') {
      // Plano público limita a janela histórica; cai para 1 ano.
      points = await fetchMarketChart(id, '365', noStore, currency);
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
