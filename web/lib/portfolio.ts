import { toNumber } from '@/lib/format';
import { assetKey } from '@/lib/market';
import type { Currency, Quote } from '@/lib/market/types';
import {
  amountInBrl,
  BASE_CURRENCY,
  convertAmount,
  DEFAULT_MONEY_CONTEXT,
  displayCurrencyFor
} from '@/lib/money';
import type { MoneyContext } from '@/lib/money';
import type { AssetType, PortfolioRow } from '@/lib/types/database';

/**
 * Cálculo da carteira.
 *
 * Puro de propósito (sem Supabase, sem React): é a mesma matemática que o app
 * WPF precisa reproduzir, e é o que os testes cobrem.
 *
 * Moedas: `portfolio.avg_price` é gravado em reais (moeda em que o usuário
 * digitou). Ativos da B3 são exibidos **sempre em reais**; cripto segue a
 * preferência do usuário (real ou dólar). Por isso a carteira tem dois
 * resumos independentes — somar dólar com real num único número seria mentira.
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
  /** Preço médio pago, já na moeda de exibição da posição. */
  avgPrice: number | null;
  /**
   * Preço médio como está gravado (reais). O formulário de edição usa este
   * valor: regravar o número convertido corromperia o custo a cada visita.
   */
  avgPriceBase: number | null;
  /** Cotação atual, já na moeda de exibição da posição. */
  price: number | null;
  changePercent: number | null;
  /** quantity × price, na moeda da posição. */
  marketValue: number | null;
  /**
   * Valor de mercado em reais, para comparar posições de moedas diferentes
   * (alocação, ranking). `null` quando não há cotação ou câmbio.
   */
  marketValueBrl: number | null;
  /** quantity × avgPrice, na moeda da posição. */
  cost: number | null;
  profit: number | null;
  profitPercent: number | null;
  /** Peso dentro do próprio grupo (bolsa ou cripto), 0..1. */
  weight: number | null;
  notes: string | null;
  hasQuote: boolean;
  /** Moeda em que os valores monetários desta posição estão expressos. */
  currency: Currency;
}

/** Resumo de um grupo de ativos que compartilham a mesma moeda. */
export interface GroupSummary {
  currency: Currency;
  totalValue: number;
  /** Soma do custo apenas das posições que têm preço médio. */
  totalCost: number;
  totalProfit: number;
  totalProfitPercent: number | null;
  dayChangeValue: number;
  dayChangePercent: number | null;
  positionsCount: number;
  /** Quantas posições ficaram sem cotação (dado desatualizado ou ticker errado). */
  missingQuotesCount: number;
}

export interface PortfolioSummary {
  /** Ações e FIIs — sempre em reais. */
  stocks: GroupSummary;
  /** Cripto — na moeda escolhida em Configurações. */
  crypto: GroupSummary;
  positionsCount: number;
  missingQuotesCount: number;
  /** Patrimônio total em reais (cripto convertida quando há câmbio). */
  totalValueBrl: number;
  /** Alocação por tipo, em reais, para a barra de proporção. */
  valueByAssetTypeBrl: Record<AssetType, number>;
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

    // Bolsa sempre em reais; cripto na preferência do usuário.
    const positionCurrency = displayCurrencyFor(row.asset_type, currency);

    const price =
      quote === null || quote === undefined
        ? null
        : convertAmount(quote.price, quote.currency, positionCurrency, usdBrl);

    const avgPrice =
      rawAvgPrice === null
        ? null
        : convertAmount(rawAvgPrice, BASE_CURRENCY, positionCurrency, usdBrl);

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
      marketValueBrl: amountInBrl(marketValue, positionCurrency, usdBrl),
      cost,
      profit,
      profitPercent,
      weight: null,
      notes: row.notes,
      hasQuote: quote !== undefined,
      currency: positionCurrency
    });
  }

  return positions;
}

/**
 * `true` quando o dia teve alguma cotação válida — evita mostrar "-0,00%" em
 * carteiras sem preço.
 */
export function summarizeGroup(
  positions: readonly Position[],
  currency: Currency
): GroupSummary {
  let totalValue = 0;
  let totalCost = 0;
  let totalProfit = 0;
  let dayChangeValue = 0;
  let previousValue = 0;
  let missingQuotesCount = 0;

  for (const position of positions) {
    if (position.marketValue !== null) {
      totalValue += position.marketValue;
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
      const previous = position.price / (1 + position.changePercent / 100);

      if (Number.isFinite(previous)) {
        previousValue += position.quantity * previous;
        dayChangeValue += position.quantity * (position.price - previous);
      }
    }
  }

  return {
    currency,
    totalValue,
    totalCost,
    totalProfit,
    totalProfitPercent: totalCost > 0 ? (totalProfit / totalCost) * 100 : null,
    dayChangeValue,
    dayChangePercent: previousValue > 0 ? (dayChangeValue / previousValue) * 100 : null,
    positionsCount: positions.length,
    missingQuotesCount
  };
}

export function summarizePositions(
  positions: readonly Position[],
  context: MoneyContext = DEFAULT_MONEY_CONTEXT
): PortfolioSummary {
  const stockPositions = positions.filter((position) => position.assetType === 'stock');
  const cryptoPositions = positions.filter((position) => position.assetType === 'crypto');

  const valueByAssetTypeBrl: Record<AssetType, number> = { stock: 0, crypto: 0 };

  for (const position of positions) {
    if (position.marketValueBrl !== null) {
      valueByAssetTypeBrl[position.assetType] += position.marketValueBrl;
    }
  }

  const missingQuotesCount = positions.filter((position) => !position.hasQuote).length;

  return {
    stocks: summarizeGroup(stockPositions, BASE_CURRENCY),
    crypto: summarizeGroup(cryptoPositions, displayCurrencyFor('crypto', context.currency)),
    positionsCount: positions.length,
    missingQuotesCount,
    totalValueBrl: valueByAssetTypeBrl.stock + valueByAssetTypeBrl.crypto,
    valueByAssetTypeBrl
  };
}

/**
 * Aplica o peso de cada posição **dentro do próprio grupo** (bolsa ou cripto):
 * comparar cripto com ação só faria sentido se as duas estivessem na mesma
 * moeda, e o produto decidiu não converter a bolsa.
 */
export function withWeights(positions: readonly Position[]): Position[] {
  const totals: Record<AssetType, number> = { stock: 0, crypto: 0 };

  for (const position of positions) {
    if (position.marketValueBrl !== null) {
      totals[position.assetType] += position.marketValueBrl;
    }
  }

  return positions.map((position) => {
    const total = totals[position.assetType];

    return {
      ...position,
      weight:
        position.marketValueBrl === null || total <= 0
          ? null
          : position.marketValueBrl / total
    };
  });
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
