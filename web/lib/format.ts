/**
 * Formatação pt-BR.
 *
 * Regra: preço de cripto pequena não pode virar "R$ 0,00". Por isso a precisão
 * é adaptativa — quanto menor o valor, mais casas decimais.
 *
 * Toda função monetária aceita a moeda como último argumento. O padrão é BRL,
 * então o código que não fala de moeda continua correto.
 */

import type { Currency } from '@/lib/market/types';

const DEFAULT_CURRENCY: Currency = 'BRL';

const percentFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const integerFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 0
});

/** Cache de formatadores: `Intl.NumberFormat` é caro de construir. */
const currencyFormatters = new Map<string, Intl.NumberFormat>();

function currencyFormatter(
  currency: Currency,
  minimumFractionDigits: number,
  maximumFractionDigits: number
): Intl.NumberFormat {
  const key = `${currency}:${minimumFractionDigits}:${maximumFractionDigits}`;
  const cached = currencyFormatters.get(key);

  if (cached) {
    return cached;
  }

  const formatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits,
    maximumFractionDigits
  });

  currencyFormatters.set(key, formatter);

  return formatter;
}

const compactFormatters = new Map<Currency, Intl.NumberFormat>();

function compactFormatter(currency: Currency): Intl.NumberFormat {
  const cached = compactFormatters.get(currency);

  if (cached) {
    return cached;
  }

  const formatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1
  });

  compactFormatters.set(currency, formatter);

  return formatter;
}

function decimalsForValue(value: number): number {
  const absolute = Math.abs(value);

  if (absolute === 0) {
    return 2;
  }

  if (absolute >= 1) {
    return 2;
  }

  if (absolute >= 0.01) {
    return 4;
  }

  if (absolute >= 0.0001) {
    return 6;
  }

  return 8;
}

/** Preço na moeda indicada, com precisão adaptativa. */
export function formatPrice(
  value: number | null | undefined,
  currency: Currency = DEFAULT_CURRENCY
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }

  const decimals = decimalsForValue(value);

  return currencyFormatter(currency, decimals, decimals).format(value);
}

/** Valor grande (patrimônio) — sempre 2 casas, sem notação compacta. */
export function formatCurrency(
  value: number | null | undefined,
  currency: Currency = DEFAULT_CURRENCY
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }

  return currencyFormatter(currency, 2, 2).format(value);
}

/** Versão compacta para eixos de gráfico e cards estreitos. */
export function formatCurrencyCompact(
  value: number | null | undefined,
  currency: Currency = DEFAULT_CURRENCY
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }

  return compactFormatter(currency).format(value);
}

/**
 * Preço sem o símbolo da moeda, para eixos de gráfico — o símbolo fica no
 * título do gráfico e repeti-lo em cada tick polui a leitura. Por isso não
 * recebe moeda: o tick é sempre só o número.
 */
export function formatPriceAxis(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }

  const decimals = decimalsForValue(value);

  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals === 2 ? 0 : 2,
    maximumFractionDigits: decimals === 2 ? 2 : decimals
  }).format(value);
}

/** `+1,23%` / `-0,45%`. Sempre com sinal explícito. */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }

  const sign = value > 0 ? '+' : '';

  return `${sign}${percentFormatter.format(value)}%`;
}

/** Quantidade: sem zeros à direita, até 8 casas (fração de cripto). */
export function formatQuantity(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }

  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8
  }).format(value);
}

export function formatInteger(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }

  return integerFormatter.format(value);
}

/** `19/11/2026 14:15` — sempre no fuso de São Paulo. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo'
  }).format(date);
}

/** `19/11` — para eixos de gráfico. */
export function formatShortDate(timestamp: number): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo'
  }).format(new Date(timestamp));
}

/** `14:15` — para ranges intradiários. */
export function formatShortTime(timestamp: number): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo'
  }).format(new Date(timestamp));
}

/** `há 3 min`, `agora`. */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  const absolute = Math.abs(diffSeconds);

  if (absolute < 60) {
    return formatter.format(Math.round(diffSeconds), 'second');
  }

  if (absolute < 3600) {
    return formatter.format(Math.round(diffSeconds / 60), 'minute');
  }

  if (absolute < 86400) {
    return formatter.format(Math.round(diffSeconds / 3600), 'hour');
  }

  return formatter.format(Math.round(diffSeconds / 86400), 'day');
}

/**
 * Horário de notícia: `hoje, 14:32` / `ontem, 09:05` / `23/11, 08:10`.
 *
 * Determinístico a partir do ISO (nada de "há 3 minutos"), para o HTML do
 * servidor e o do cliente baterem sem aviso de hidratação.
 */
export function formatNewsTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) {
    return '';
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const timeZone = 'America/Sao_Paulo';
  const dayKey = (value: Date) =>
    new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone }).format(value);
  const clock = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone
  }).format(date);

  if (dayKey(date) === dayKey(now)) {
    return `hoje, ${clock}`;
  }

  const yesterday = new Date(now.getTime() - 86_400_000);

  if (dayKey(date) === dayKey(yesterday)) {
    return `ontem, ${clock}`;
  }

  const day = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone
  }).format(date);

  return `${day}, ${clock}`;
}

/** `13,75% a.a.` — percentual com vírgula, sem sinal. */
export function formatRate(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }

  return `${percentFormatter.format(value)}% a.a.`;
}

/** `09/12/2026` a partir de ISO `YYYY-MM-DD`; vazio quando não há data. */
export function formatIsoDate(iso: string | null | undefined): string {
  if (!iso) {
    return '';
  }

  const date = new Date(`${iso}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date);
}

/** Converte `numeric` do PostgREST (string) para número com segurança. */
export function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : null;
}
