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
 * título do gráfico e repeti-lo em cada tick polui a leitura.
 */
export function formatPriceAxis(
  value: number | null | undefined,
  currency: Currency = DEFAULT_CURRENCY
): string {
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

/** Converte `numeric` do PostgREST (string) para número com segurança. */
export function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : null;
}
