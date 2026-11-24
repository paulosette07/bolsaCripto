import type { AssetType } from '@/lib/types/database';

/**
 * Moeda de exibição de uma cotação.
 *
 * A B3 negocia em reais; cripto tem preço nativo em dólar. Por isso o
 * `currency` viaja junto com o `Quote`: quem exibe o número sabe em que
 * moeda ele está e não formata errado.
 */
export type Currency = 'BRL' | 'USD';

export const CURRENCIES: readonly Currency[] = ['BRL', 'USD'];

export const CURRENCY_LABELS: Record<Currency, string> = {
  BRL: 'Real',
  USD: 'Dólar'
};

/** `BRL` -> `R$`, `USD` -> `US$`. Usado em toggles e eixos de gráfico. */
export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  BRL: 'R$',
  USD: 'US$'
};

/**
 * Contrato único de cotação usado por toda a aplicação (web e desktop).
 * O app WPF espelha exatamente estes campos em C#.
 */
export interface Quote {
  /** Símbolo exibido: PETR4, BTC, ETH… */
  ticker: string;
  assetType: AssetType;
  /** Id canônico da CoinGecko. `null` para ativos de bolsa. */
  cryptoId: string | null;
  name: string;
  /** Preço atual na moeda indicada em `currency`. */
  price: number;
  /** Variação percentual do dia (bolsa) ou 24h (cripto). */
  changePercent: number;
  /** Variação absoluta correspondente, em `currency`. */
  changeValue: number;
  previousClose: number | null;
  currency: Currency;
  logoUrl: string | null;
  updatedAt: string;
}

export interface HistoryPoint {
  /** Epoch em milissegundos. */
  timestamp: number;
  price: number;
}

export interface PriceHistory {
  ticker: string;
  assetType: AssetType;
  cryptoId: string | null;
  /** Moeda dos preços em `points`. */
  currency: Currency;
  points: HistoryPoint[];
}

export type MarketRange = '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | 'max';

export const MARKET_RANGES: readonly MarketRange[] = ['1d', '5d', '1mo', '3mo', '6mo', '1y', 'max'];

export const RANGE_LABELS: Record<MarketRange, string> = {
  '1d': '1D',
  '5d': '5D',
  '1mo': '1M',
  '3mo': '3M',
  '6mo': '6M',
  '1y': '1A',
  max: 'Máx'
};

export interface AssetSearchResult {
  ticker: string;
  assetType: AssetType;
  cryptoId: string | null;
  name: string;
  logoUrl: string | null;
}

/** Identificador mínimo para pedir cotação de um ativo. */
export interface AssetRef {
  ticker: string;
  assetType: AssetType;
  cryptoId: string | null;
}

export function isMarketRange(value: unknown): value is MarketRange {
  return typeof value === 'string' && (MARKET_RANGES as readonly string[]).includes(value);
}

export function isAssetType(value: unknown): value is AssetType {
  return value === 'stock' || value === 'crypto';
}

export function isCurrency(value: unknown): value is Currency {
  return value === 'BRL' || value === 'USD';
}

/**
 * Lê a moeda vinda da query string (`?currency=usd`) ou de qualquer fonte
 * externa. Case-insensitive; desconhecido cai no fallback.
 */
export function parseCurrency(value: unknown, fallback: Currency = 'BRL'): Currency {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toUpperCase();

  return isCurrency(normalized) ? normalized : fallback;
}

/** Bolsa é sempre em reais; só cripto aceita trocar a moeda de exibição. */
export function currencyForAsset(assetType: AssetType, requested: Currency): Currency {
  return assetType === 'crypto' ? requested : 'BRL';
}

/**
 * Link para a página de mercado de um ativo.
 *
 * Cripto carrega o id canônico da CoinGecko (sem ele a página teria que resolver
 * o id de novo) e, opcionalmente, a moeda escolhida. Ativo da B3 ignora moeda:
 * é sempre real.
 */
export function assetHref(asset: AssetRef, options: { currency?: Currency } = {}): string {
  const params = new URLSearchParams({
    ticker: asset.ticker.trim().toUpperCase(),
    type: asset.assetType
  });

  if (asset.assetType === 'crypto' && asset.cryptoId) {
    params.set('cryptoId', asset.cryptoId);
  }

  if (asset.assetType === 'crypto' && options.currency === 'USD') {
    params.set('currency', 'USD');
  }

  return `/mercado?${params.toString()}`;
}
