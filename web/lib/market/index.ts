import { getBrapiHistory, getBrapiQuotes } from './brapi';
import {
  getCryptoHistory,
  getCryptoQuotes,
  resolveCryptoId,
  searchCrypto
} from './coingecko';
import { fetchJson } from './http';
import type {
  AssetRef,
  AssetSearchResult,
  Currency,
  MarketRange,
  PriceHistory,
  Quote
} from './types';
import type { AssetType } from '@/lib/types/database';

/**
 * Fachada única de mercado.
 *
 * Toda a aplicação (páginas, rotas de API, cron de alertas) fala só com este
 * módulo. Assim a troca de provider — ou a inclusão de uma B3 oficial no
 * desktop — não vaza para as telas.
 */

const BRAPI_BASE_URL = 'https://brapi.dev/api';
const MAX_SEARCH_RESULTS = 10;

interface BrapiStockListItem {
  stock?: string;
  name?: string;
  logo?: string;
  type?: string;
  subType?: string;
}

interface BrapiStockListResponse {
  stocks?: BrapiStockListItem[];
  error?: boolean;
  message?: string;
}

/** Chave estável de um ativo, independente de case. */
export function assetKey(assetType: AssetType, ticker: string): string {
  return `${assetType}:${ticker.trim().toUpperCase()}`;
}

/** Busca ações/FIIs na B3 pelo nome ou ticker. */
export async function searchStocks(query: string): Promise<AssetSearchResult[]> {
  const trimmed = query.trim();

  if (trimmed.length < 2) {
    return [];
  }

  const url = `${BRAPI_BASE_URL}/quote/list?search=${encodeURIComponent(trimmed)}&limit=${MAX_SEARCH_RESULTS}`;

  try {
    const payload = await fetchJson<BrapiStockListResponse>(url, { revalidateSeconds: 600 });

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
  } catch {
    // Busca é conveniência: o usuário sempre pode digitar o ticker direto.
    return [];
  }
}

/**
 * Busca unificada. Ações primeiro (o público é B3), cripto depois.
 * Erros de provider são engolidos: a UI mostra lista vazia, não erro 500.
 */
export async function searchAssets(query: string): Promise<AssetSearchResult[]> {
  const trimmed = query.trim();

  if (trimmed.length < 2) {
    return [];
  }

  const [stocks, cryptos] = await Promise.all([
    searchStocks(trimmed),
    searchCrypto(trimmed, 6).catch(() => [] as AssetSearchResult[])
  ]);

  return [...stocks, ...cryptos].slice(0, MAX_SEARCH_RESULTS + 4);
}

/** Garante que um ativo de cripto tenha o id canônico da CoinGecko. */
export async function withResolvedCryptoId(asset: AssetRef): Promise<AssetRef> {
  if (asset.assetType !== 'crypto' || asset.cryptoId) {
    return asset;
  }

  const cryptoId = await resolveCryptoId(asset.ticker);

  return { ...asset, cryptoId };
}

interface QuoteOptions {
  /** O cron de alertas precisa do preço de agora, não do cache. */
  noStore?: boolean;
  /**
   * Moeda de exibição das criptos. Ignorado para ações/FIIs: a B3 negocia
   * em reais e converter por cima seria um número inventado.
   */
  currency?: Currency;
}

/**
 * Cotações de uma lista mista de ativos, com duas chamadas no máximo
 * (uma para a B3, uma para cripto).
 */
export async function getQuotes(
  assets: readonly AssetRef[],
  options: QuoteOptions = {}
): Promise<Quote[]> {
  const stockTickers = new Set<string>();
  const cryptoIds = new Set<string>();
  const cryptoToResolve: string[] = [];

  for (const asset of assets) {
    if (asset.assetType === 'stock') {
      stockTickers.add(asset.ticker.trim().toUpperCase());
    } else if (asset.cryptoId) {
      cryptoIds.add(asset.cryptoId.toLowerCase());
    } else {
      cryptoToResolve.push(asset.ticker);
    }
  }

  if (cryptoToResolve.length > 0) {
    const resolved = await Promise.all(cryptoToResolve.map((ticker) => resolveCryptoId(ticker)));

    for (const cryptoId of resolved) {
      if (cryptoId) {
        cryptoIds.add(cryptoId.toLowerCase());
      }
    }
  }

  const [stockQuotes, cryptoQuotes] = await Promise.all([
    stockTickers.size > 0
      ? getBrapiQuotes([...stockTickers], options)
      : Promise.resolve([] as Quote[]),
    cryptoIds.size > 0
      ? getCryptoQuotes([...cryptoIds], { noStore: options.noStore, currency: options.currency })
      : Promise.resolve([] as Quote[])
  ]);

  return [...stockQuotes, ...cryptoQuotes];
}

/** Mapa `assetType:ticker` -> cotação, para casar com a carteira sem O(n²). */
export async function getQuoteMap(
  assets: readonly AssetRef[],
  options: QuoteOptions = {}
): Promise<Map<string, Quote>> {
  const quotes = await getQuotes(assets, options);
  const map = new Map<string, Quote>();

  for (const quote of quotes) {
    map.set(assetKey(quote.assetType, quote.ticker), quote);
  }

  return map;
}

/** Histórico de um ativo, roteado pelo tipo. */
export async function getHistory(
  asset: AssetRef,
  range: MarketRange,
  options: QuoteOptions = {}
): Promise<PriceHistory> {
  if (asset.assetType === 'stock') {
    return getBrapiHistory(asset.ticker, range, options);
  }

  const resolved = await withResolvedCryptoId(asset);

  if (!resolved.cryptoId) {
    throw new Error(`Não foi possível identificar a criptomoeda "${asset.ticker}".`);
  }

  const history = await getCryptoHistory(resolved.cryptoId, range, {
    noStore: options.noStore,
    currency: options.currency
  });

  return { ...history, ticker: asset.ticker.trim().toUpperCase() };
}

/** Busca a cotação de um único ativo. `null` se não existir na fonte. */
export async function getSingleQuote(
  asset: AssetRef,
  options: QuoteOptions = {}
): Promise<Quote | null> {
  const quotes = await getQuotes([asset], options);

  return quotes[0] ?? null;
}
