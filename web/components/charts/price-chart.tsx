'use client';

import { AlertCircle, Loader2 } from 'lucide-react';
import { useCallback, useId, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

import {
  formatPercent,
  formatPrice,
  formatPriceAxis,
  formatShortDate,
  formatShortTime
} from '@/lib/format';
import type {
  AssetRef,
  Currency,
  HistoryPoint,
  MarketRange,
  PriceHistory
} from '@/lib/market/types';
import { MARKET_RANGES, RANGE_LABELS } from '@/lib/market/types';

interface PriceChartProps {
  asset: AssetRef;
  initialRange: MarketRange;
  initialPoints: HistoryPoint[];
  /** Variação do dia, só para colorir a área. */
  changePercent: number | null;
  /** Moeda dos preços já carregados e das próximas requisições. */
  currency?: Currency;
  height?: number;
}

interface ChartDatum {
  timestamp: number;
  price: number;
}

function buildQuery(asset: AssetRef, range: MarketRange, currency: Currency): string {
  const params = new URLSearchParams({
    ticker: asset.ticker,
    type: asset.assetType,
    range,
    currency
  });

  if (asset.cryptoId) {
    params.set('cryptoId', asset.cryptoId);
  }

  return params.toString();
}

export function PriceChart({
  asset,
  initialRange,
  initialPoints,
  changePercent,
  currency = 'BRL',
  height = 300
}: PriceChartProps) {
  const [range, setRange] = useState<MarketRange>(initialRange);
  const [points, setPoints] = useState<HistoryPoint[]>(initialPoints);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gradientId = useId().replace(/:/g, '');

  const loadRange = useCallback(
    async (nextRange: MarketRange) => {
      setRange(nextRange);

      if (nextRange === initialRange) {
        setPoints(initialPoints);
        setError(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/history?${buildQuery(asset, nextRange, currency)}`, {
          headers: { accept: 'application/json' }
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? 'Não foi possível carregar o histórico.');
        }

        const history = (await response.json()) as PriceHistory;
        setPoints(history.points);
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : 'Erro ao carregar o histórico.'
        );
      } finally {
        setIsLoading(false);
      }
    },
    [asset, currency, initialPoints, initialRange]
  );

  // Sem `useEffect` sincronizando props -> state: o pai passa `key={asset}` e o
  // React remonta o componente ao trocar de ativo. Estado derivado de prop por
  // efeito gera render em cascata (e o lint do React 19 reclama, com razão).
  const data = useMemo<ChartDatum[]>(
    () => points.map((point) => ({ timestamp: point.timestamp, price: point.price })),
    [points]
  );

  const isUp = (changePercent ?? 0) >= 0;
  const strokeColor = isUp ? '#10B981' : '#EF4444';
  const usesTimeLabels = range === '1d' || range === '5d';

  const firstPrice = data[0]?.price;
  const lastPrice = data[data.length - 1]?.price;
  const rangeChangePercent =
    firstPrice && lastPrice && firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : null;

  if (error) {
    return (
      <div className="surface-card flex flex-col items-center justify-center gap-2 p-8 text-center">
        <AlertCircle className="size-5 text-down" aria-hidden="true" />
        <p className="text-sm text-ink-muted">{error}</p>
        <button
          type="button"
          onClick={() => void loadRange(range)}
          className="text-xs font-medium text-up underline-offset-4 hover:underline"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex rounded-[8px] border border-line bg-canvas p-0.5">
            {MARKET_RANGES.map((marketRange) => (
              <button
                key={marketRange}
                type="button"
                onClick={() => void loadRange(marketRange)}
                aria-pressed={range === marketRange}
                className={`rounded-[6px] px-2.5 py-1 text-xs font-medium transition-colors ${
                  range === marketRange
                    ? 'bg-surface-3 text-ink'
                    : 'text-ink-faint hover:text-ink-muted'
                }`}
              >
                {RANGE_LABELS[marketRange]}
              </button>
            ))}
          </div>

          {isLoading ? (
            <Loader2 className="size-3.5 animate-spin text-ink-faint" aria-label="Carregando" />
          ) : null}
        </div>

        {rangeChangePercent !== null ? (
          <p className="numeric text-xs text-ink-faint">
            Variação no período:{' '}
            <span className={rangeChangePercent >= 0 ? 'text-up' : 'text-down'}>
              {formatPercent(rangeChangePercent)}
            </span>
          </p>
        ) : null}
      </div>

      {data.length === 0 ? (
        <div
          className="flex items-center justify-center rounded-[12px] border border-line bg-surface text-sm text-ink-muted"
          style={{ height }}
        >
          Sem histórico disponível para este período.
        </div>
      ) : (
        <div style={{ height }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={strokeColor} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid stroke="#27272A" strokeDasharray="3 3" vertical={false} />

              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(value: number) =>
                  usesTimeLabels ? formatShortTime(value) : formatShortDate(value)
                }
                tick={{ fill: '#71717A', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#27272A' }}
                minTickGap={28}
              />

              <YAxis
                domain={['auto', 'auto']}
                tickFormatter={(value: number) => formatPriceAxis(value)}
                tick={{ fill: '#71717A', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={72}
              />

              <Tooltip
                cursor={{ stroke: '#3F3F46', strokeDasharray: '3 3' }}
                contentStyle={{
                  backgroundColor: '#18181B',
                  border: '1px solid #27272A',
                  borderRadius: 10,
                  padding: '8px 10px',
                  fontSize: 12
                }}
                labelStyle={{ color: '#A1A1AA', marginBottom: 4 }}
                itemStyle={{ color: '#F4F4F5' }}
                labelFormatter={(label) => {
                  const timestamp = typeof label === 'number' ? label : Number(label);

                  if (!Number.isFinite(timestamp)) {
                    return '';
                  }

                  return usesTimeLabels
                    ? `${formatShortDate(timestamp)} ${formatShortTime(timestamp)}`
                    : formatShortDate(timestamp);
                }}
                formatter={(value) => {
                  const price = typeof value === 'number' ? value : Number(value);

                  return [
                    Number.isFinite(price) ? formatPrice(price, currency) : '—',
                    asset.ticker
                  ];
                }}
              />

              <Area
                type="monotone"
                dataKey="price"
                stroke={strokeColor}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 3, fill: strokeColor, stroke: '#121214', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
