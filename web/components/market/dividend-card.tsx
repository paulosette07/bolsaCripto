import { CalendarClock, Coins, Percent, Repeat, Wallet } from 'lucide-react';

import { Card, CardHeader } from '@/components/ui/card';
import { formatCurrency, formatIsoDate, formatPlainPercent, formatQuantity } from '@/lib/format';
import {
  FREQUENCY_DESCRIPTIONS,
  FREQUENCY_LABELS,
  projectAnnualDividend
} from '@/lib/market/fundamentals';
import type { DividendMetrics } from '@/lib/market/fundamentals';

interface DividendCardProps {
  metrics: DividendMetrics | null;
  /** Quantidade que o usuário possui do ativo (para projetar a renda). */
  quantity: number | null;
}

interface MetricProps {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Coins;
}

function Metric({ label, value, hint, icon: Icon }: MetricProps) {
  return (
    <div className="rounded-[8px] border border-line bg-canvas p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-ink-faint">
        <Icon className="size-3" aria-hidden="true" strokeWidth={2} />
        {label}
      </div>
      <p className="numeric mt-1 text-sm font-semibold tracking-tight text-ink">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-ink-faint">{hint}</p> : null}
    </div>
  );
}

/**
 * Ficha de proventos do ativo.
 *
 * Tudo aqui é em reais: dividendo da B3 é pago em reais, independente da moeda
 * escolhida para exibir a cotação. Quando o usuário tem posição, a última linha
 * traduz o yield em dinheiro que efetivamente cai na conta.
 */
export function DividendCard({ metrics, quantity }: DividendCardProps) {
  const annualPerShare = projectAnnualDividend(metrics);
  const hasPosition = quantity !== null && quantity > 0;

  return (
    <Card>
      <CardHeader
        title="Proventos"
        description="Dividendos e rendimentos dos últimos 12 meses, em reais"
        action={
          metrics && metrics.hasDividends ? (
            <span className="rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-faint">
              {FREQUENCY_LABELS[metrics.frequency]}
            </span>
          ) : null
        }
      />

      {!metrics || !metrics.hasDividends ? (
        <div className="px-4 py-6 text-center sm:px-5">
          <p className="text-sm text-ink-muted">
            {metrics === null
              ? 'Não foi possível carregar os proventos deste ativo agora.'
              : 'Este ativo não distribuiu proventos nos últimos 24 meses.'}
          </p>
          <p className="mt-1 text-[11px] text-ink-faint">
            A fonte é o histórico de dividendos do Yahoo Finance; FIIs e ações costumam aparecer com
            defasagem de alguns dias.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4 sm:p-5">
            <Metric
              label="Dividend yield 12m"
              value={formatPlainPercent(metrics.dividendYield)}
              hint="sobre o preço atual"
              icon={Percent}
            />
            <Metric
              label="Pago em 12 meses"
              value={formatCurrency(metrics.trailingTwelveMonths, 'BRL')}
              hint="por cota"
              icon={Coins}
            />
            <Metric
              label="Periodicidade"
              value={FREQUENCY_LABELS[metrics.frequency]}
              hint={FREQUENCY_DESCRIPTIONS[metrics.frequency]}
              icon={Repeat}
            />
            <Metric
              label="Média por pagamento"
              value={formatCurrency(metrics.averagePayment, 'BRL')}
              hint={`${metrics.paymentsLastYear} ${
                metrics.paymentsLastYear === 1 ? 'pagamento' : 'pagamentos'
              } em 12m`}
              icon={CalendarClock}
            />
          </div>

          {hasPosition && annualPerShare !== null ? (
            <div className="mx-4 mb-4 flex items-start gap-2.5 rounded-[8px] border border-up/25 bg-up/8 p-3 sm:mx-5 sm:mb-5">
              <Wallet className="mt-px size-3.5 shrink-0 text-up" aria-hidden="true" />
              <p className="text-xs leading-relaxed text-ink-muted">
                Com <span className="numeric font-medium text-ink">{formatQuantity(quantity)}</span>{' '}
                cotas, o ritmo atual projeta{' '}
                <span className="numeric font-medium text-up">
                  {formatCurrency(annualPerShare * quantity, 'BRL')}
                </span>{' '}
                por ano em proventos
                {metrics.frequency !== 'irregular' && metrics.frequency !== 'none'
                  ? ` (≈ ${formatCurrency((annualPerShare * quantity) / 12, 'BRL')} por mês em média)`
                  : ''}
                .
              </p>
            </div>
          ) : null}

          <div className="border-t border-line">
            <p className="px-4 pt-3 text-[11px] font-medium uppercase tracking-wide text-ink-faint sm:px-5">
              Últimos proventos
            </p>

            <ul className="divide-y divide-line/70 px-4 pb-3 sm:px-5">
              {metrics.history.slice(0, 6).map((payment) => (
                <li
                  key={`${payment.date}-${payment.amount}`}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="numeric text-xs text-ink-muted">
                    {formatIsoDate(payment.date)}
                    {metrics.lastPayment?.date === payment.date ? (
                      <span className="ml-2 rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] text-ink-faint">
                        mais recente
                      </span>
                    ) : null}
                  </span>
                  <span className="numeric text-xs font-medium text-ink">
                    {formatCurrency(payment.amount, 'BRL')}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-ink-faint sm:px-5">
            {metrics.estimatedNextPayment
              ? `Próximo provento estimado em ${formatIsoDate(metrics.estimatedNextPayment)}, projetando o intervalo médio entre pagamentos. `
              : ''}
            Datas e valores são ex-dividendos reportados pela fonte; confirme no informe da
            corretora antes de decidir.
          </p>
        </>
      )}
    </Card>
  );
}
