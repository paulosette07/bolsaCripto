import { getYahooDividends } from './yahoo';
import type { YahooDividendEvent } from './yahoo';

/**
 * Proventos de um ativo da B3.
 *
 * A tela de mercado mostra o que o investidor de renda olha primeiro: quanto o
 * ativo pagou nos últimos 12 meses, qual o dividend yield sobre o preço de
 * agora e **de quanto em quanto tempo** ele paga (mensal, trimestral, semestral
 * ou anual). A periodicidade é inferida do histórico — a fonte não a informa.
 */

export type DividendFrequency =
  | 'monthly'
  | 'quarterly'
  | 'semiannual'
  | 'annual'
  | 'irregular'
  | 'none';

export const FREQUENCY_LABELS: Record<DividendFrequency, string> = {
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
  irregular: 'Irregular',
  none: 'Sem proventos'
};

/** Texto completo para a ficha do ativo. */
export const FREQUENCY_DESCRIPTIONS: Record<DividendFrequency, string> = {
  monthly: 'paga todo mês',
  quarterly: 'paga a cada três meses',
  semiannual: 'paga a cada seis meses',
  annual: 'paga uma vez por ano',
  irregular: 'intervalo irregular entre pagamentos',
  none: 'não distribuiu proventos no período'
};

export interface DividendPayment {
  /** ISO `YYYY-MM-DD` do ex-date. */
  date: string;
  /** Valor por cota, na moeda do papel. */
  amount: number;
}

export interface DividendMetrics {
  ticker: string;
  /** Soma dos proventos dos últimos 12 meses, por cota. */
  trailingTwelveMonths: number;
  /** Dividend yield de 12 meses em % sobre o preço atual. `null` sem preço. */
  dividendYield: number | null;
  /** Quantos pagamentos ocorreram nos últimos 12 meses. */
  paymentsLastYear: number;
  /** Periodicidade inferida do intervalo entre pagamentos. */
  frequency: DividendFrequency;
  /** Média por pagamento nos últimos 12 meses. */
  averagePayment: number | null;
  lastPayment: DividendPayment | null;
  /** Data estimada do próximo provento (último pagamento + intervalo médio). */
  estimatedNextPayment: string | null;
  /** Pagamentos, do mais recente para o mais antigo. */
  history: DividendPayment[];
  /** `false` quando o ativo não pagou nada na janela analisada. */
  hasDividends: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_MONTHS = 12;
const MIN_GAP_DAYS = 5;

/** Periodicidade a partir do intervalo mediano entre pagamentos, em dias. */
export function inferFrequency(intervalsInDays: readonly number[]): DividendFrequency {
  if (intervalsInDays.length === 0) {
    return 'none';
  }

  const sorted = [...intervalsInDays].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;

  if (!Number.isFinite(median) || median <= 0) {
    return 'irregular';
  }

  if (median <= 45) {
    return 'monthly';
  }

  if (median <= 110) {
    return 'quarterly';
  }

  if (median <= 200) {
    return 'semiannual';
  }

  if (median <= 400) {
    return 'annual';
  }

  return 'irregular';
}

function toIsoDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * Métricas a partir dos eventos crus — pura de propósito, para ser testável
 * sem rede e reutilizável pelo app desktop.
 */
export function computeDividendMetrics(
  ticker: string,
  events: readonly YahooDividendEvent[],
  price: number | null,
  now: Date = new Date()
): DividendMetrics {
  const sorted = [...events].sort((a, b) => b.timestamp - a.timestamp);
  const cutoff = now.getTime() - HISTORY_MONTHS * 30 * DAY_MS;

  const lastTwelveMonths = sorted.filter((event) => event.timestamp >= cutoff);
  const trailingTwelveMonths = lastTwelveMonths.reduce((total, event) => total + event.amount, 0);

  const intervals: number[] = [];

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index];
    const previous = sorted[index + 1];

    if (!current || !previous) {
      continue;
    }

    const gapDays = Math.abs(current.timestamp - previous.timestamp) / DAY_MS;

    // Pagamentos no mesmo dia (bonificação + dividendo) não formam intervalo.
    if (gapDays >= MIN_GAP_DAYS) {
      intervals.push(gapDays);
    }
  }

  const frequency =
    lastTwelveMonths.length === 0 ? 'none' : inferFrequency(intervals.slice(0, 8));

  const lastPayment = sorted[0]
    ? { date: toIsoDate(sorted[0].timestamp), amount: sorted[0].amount }
    : null;

  const averageIntervalDays =
    intervals.length > 0
      ? intervals.slice(0, 8).reduce((total, gap) => total + gap, 0) /
        Math.min(intervals.length, 8)
      : null;

  const estimatedNextPayment =
    lastPayment && averageIntervalDays !== null
      ? toIsoDate(new Date(lastPayment.date).getTime() + averageIntervalDays * DAY_MS)
      : null;

  const dividendYield =
    price !== null && Number.isFinite(price) && price > 0 && trailingTwelveMonths > 0
      ? (trailingTwelveMonths / price) * 100
      : null;

  return {
    ticker: ticker.trim().toUpperCase(),
    trailingTwelveMonths,
    dividendYield,
    paymentsLastYear: lastTwelveMonths.length,
    frequency,
    averagePayment:
      lastTwelveMonths.length > 0 ? trailingTwelveMonths / lastTwelveMonths.length : null,
    lastPayment,
    estimatedNextPayment,
    history: sorted.slice(0, 8).map((event) => ({
      date: toIsoDate(event.timestamp),
      amount: event.amount
    })),
    hasDividends: sorted.length > 0
  };
}

/**
 * Proventos de um papel da B3. Falha de rede vira `null` — a página de mercado
 * continua funcionando sem a ficha de dividendos.
 */
export async function getDividendMetrics(
  ticker: string,
  price: number | null,
  options: { noStore?: boolean } = {}
): Promise<DividendMetrics | null> {
  try {
    const events = await getYahooDividends(ticker, options);

    return computeDividendMetrics(ticker, events, price);
  } catch {
    return null;
  }
}

/** Quanto o ativo pagaria por cota em 12 meses, projetando o ritmo atual. */
export function projectAnnualDividend(metrics: DividendMetrics | null): number | null {
  if (!metrics) {
    return null;
  }

  const paymentYears: Record<DividendFrequency, number | null> = {
    monthly: 12,
    quarterly: 4,
    semiannual: 2,
    annual: 1,
    irregular: null,
    none: null
  };

  const perYear = paymentYears[metrics.frequency];

  if (perYear === null || metrics.averagePayment === null) {
    return metrics.trailingTwelveMonths > 0 ? metrics.trailingTwelveMonths : null;
  }

  return metrics.averagePayment * perYear;
}
