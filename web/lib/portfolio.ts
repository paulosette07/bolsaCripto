import { toNumber } from '@/lib/format';
import { assetKey } from '@/lib/market';
import type { Currency, Quote } from '@/lib/market/types';
import { BASE_CURRENCY, convertAmount, DEFAULT_MONEY_CONTEXT } from '@/lib/money';
import type { MoneyContext } from '@/lib/money';
import type { AssetType, PortfolioRow } from '@/lib/types/database';

/**
 * Cálculo da carteira.
 *
 * Puro de propósito (sem Supabase, sem React): é a mesma matemática que o app
 * WPF precisa reproduzir, e é o que os testes cobrem.
 *
 * Moeda: `portfolio.avg_price` é gravado em reais (moeda em que o usuário
 * digitou). Quando a exibição é em dólar, preço médio, custo, valor de mercado
 * e resultado são convertidos com a taxa corrente — assim a soma das posições
 * fecha com o patrimônio mostrado no topo da página.
 */

export interface Position {
  id: string;
  ticker: string;
  assetType: AssetType;
  cryptoId: string | null;
  name: string;
  logoUrl: string | null;
  /** Quantidade de cotas (bolsa) ou fração (cripto). */
  quantity: number;
  /** Preço médio pago, já na moeda de exibição. */
  avgPrice: number | null;
  /**
   * Preço médio como está gravado (reais). O formulário de edição usa este
   * valor: regravar o número convertido corromperia o custo a cada visita.
   */
  avgPriceBase: number | null;
  /** Cotação atual, já na moeda de exibição. */
  price: number | null;
  changePercent: number | null;
  /** quantity × price. `null` quando não há cotação. */
  marketValue: number | null;
  /** quantity × avgPrice. `null` quando o usuário não informou preço médio. */
  cost: number | null;
  profit: number | null;
  profitPercent: number | null;
  /** Peso no patrimônio, 0..1. `null` se não há cotação. */
  weight: number | null;
  notes: string | null;
  hasQuote: boolean;
  /** Moeda em que os valores monetários desta posição estão expressos. */
  currency: Currency;
}

export interface PortfolioSummary {
  /** Moeda de todos os totais abaixo. */
  currency: Currency;
  totalValue: number;
  /** Soma do custo apenas das posições que têm preço médio. */
  totalCost: number;
  totalProfit: number;
  totalProfitPercent: number | null;
  /** Variação do dia, na moeda de exibição. */
  dayChangeValue: number;
  dayChangePercent: number | null;
  positionsCount: number;
  /** Quantas posições ficaram sem cotação (dado desatualizado ou ticker errado). */
  missingQuotesCount: number;
  valueByAssetType: Record<AssetType, number>;
  best: Position | null;
  worst: Position | null;
}

export function buildPositions(
  rows: readonly PortfolioRow[],
  quotes: ReadonlyMap<string, Quote>,
  context: MoneyContext = DEFAULT_MONEY_CONTEXT
): Position[] {
  const positions: Position[] = [];
  const { currency, usdBrl } = context;

  for (const row of rows) {
    const quantity = toNumber(row.quantity) ?? 0;
    const rawAvgPrice = toNumber(row.avg_price);
    const quote = quotes.get(assetKey(row.asset_type, row.ticker));

    // Cotação vem na moeda em que foi pedida; o preço médio vem do banco em BRL.
    const price =
      quote === null || quote === undefined
        ? null
        : convertAmount(quote.price, quote.currency, currency, usdBrl);

    const avgPrice =
      rawAvgPrice === null
        ? null
        : convertAmount(rawAvgPrice, BASE_CURRENCY, currency, usdBrl);

    const marketValue = price === null ? null : quantity * price;
    const cost = avgPrice === null ? null : quantity * avgPrice;
    const profit = marketValue !== null && cost !== null ? marketValue - cost : null;
    const profitPercent =
      profit !== null && cost !== null && cost > 0 ? (profit / cost) * 100 : null;

    positions.push({
      id: row.id,
      ticker: row.ticker,
      assetType: row.asset_type,
      cryptoId: row.crypto_id,
      name: quote?.name ?? row.ticker,
      logoUrl: quote?.logoUrl ?? null,
      quantity,
      avgPrice,
      avgPriceBase: rawAvgPrice,
      price,
      changePercent: quote?.changePercent ?? null,
      marketValue,
      cost,
      profit,
      profitPercent,
      weight: null,
      notes: row.notes,
      hasQuote: quote !== undefined,
      currency
    });
  }

  return positions;
}

export function summarizePositions(positions: readonly Position[]): PortfolioSummary {
  let totalValue = 0;
  let totalCost = 0;
  let totalProfit = 0;
  let dayChangeValue = 0;
  let previousValue = 0;
  let missingQuotesCount = 0;

  const valueByAssetType: Record<AssetType, number> = { stock: 0, crypto: 0 };

  for (const position of positions) {
    if (position.marketValue !== null) {
      totalValue += position.marketValue;
      valueByAssetType[position.assetType] += position.marketValue;
    } else {
      missingQuotesCount += 1;
    }

    if (position.cost !== null) {
      totalCost += position.cost;
    }

    if (position.profit !== null) {
      totalProfit += position.profit;
    }

    if (position.price !== null && position.changePercent !== null) {
      const percent = position.changePercent;
      const previous = position.price / (1 + percent / 100);

      if (Number.isFinite(previous)) {
        previousValue += position.quantity * previous;
        dayChangeValue += position.quantity * (position.price - previous);
      }
    }
  }

  let best: Position | null = null;
  let worst: Position | null = null;

  for (const position of positions) {
    if (position.profitPercent === null) {
      continue;
    }

    if (best === null || position.profitPercent > (best.profitPercent ?? 0)) {
      best = position;
    }

    if (worst === null || position.profitPercent < (worst.profitPercent ?? 0)) {
      worst = position;
    }
  }

  const totalProfitPercent = totalCost > 0 ? (totalProfit / totalCost) * 100 : null;
  const dayChangePercent = previousValue > 0 ? (dayChangeValue / previousValue) * 100 : null;

  return {
    currency: positions[0]?.currency ?? BASE_CURRENCY,
    totalValue,
    totalCost,
    totalProfit,
    totalProfitPercent,
    dayChangeValue,
    dayChangePercent,
    positionsCount: positions.length,
    missingQuotesCount,
    valueByAssetType,
    best,
    worst
  };
}

/** Aplica o peso de cada posição no patrimônio total (0..1). */
export function withWeights(positions: readonly Position[], totalValue: number): Position[] {
  if (totalValue <= 0) {
    return positions.map((position) => ({ ...position, weight: null }));
  }

  return positions.map((position) => ({
    ...position,
    weight: position.marketValue === null ? null : position.marketValue / totalValue
  }));
}

export interface PositionDraft {
  ticker: string;
  assetType: AssetType;
  cryptoId: string | null;
  quantity: number;
  avgPrice: number | null;
  notes: string | null;
}

/** Soma a quantidade quando o ativo já existe na carteira (compra adicional). */
export function mergeQuantity(currentQuantity: number, addedQuantity: number): number {
  return currentQuantity + addedQuantity;
}

/** Preço médio ponderado após uma nova compra. */
export function mergeAveragePrice(
  currentQuantity: number,
  currentAvgPrice: number | null,
  addedQuantity: number,
  addedPrice: number | null
): number | null {
  if (addedPrice === null) {
    return currentAvgPrice;
  }

  if (currentAvgPrice === null || currentQuantity <= 0) {
    return addedPrice;
  }

  const totalQuantity = currentQuantity + addedQuantity;

  if (totalQuantity <= 0) {
    return currentAvgPrice;
  }

  return (currentQuantity * currentAvgPrice + addedQuantity * addedPrice) / totalQuantity;
}
