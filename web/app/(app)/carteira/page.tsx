import type { Metadata } from 'next';
import { Coins, PieChart, TrendingUp, Wallet } from 'lucide-react';

import { AutoRefresh } from '@/components/layout/auto-refresh';
import { PositionForm } from '@/components/portfolio/position-form';
import { StatCard } from '@/components/dashboard/stat-card';
import { deletePositionAction, savePositionAction } from '@/app/actions/portfolio';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { ChangePill } from '@/components/ui/delta';
import { formatCurrency, formatPercent, formatPrice, formatQuantity } from '@/lib/format';
import { getQuoteMap } from '@/lib/market';
import type { AssetRef } from '@/lib/market/types';
import { quoteMapInCurrency } from '@/lib/money';
import { buildPositions, summarizePositions, withWeights } from '@/lib/portfolio';
import { getMoneyContext } from '@/lib/preferences/display-currency';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Carteira'
};

export default async function PortfolioPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: rows } = await supabase
    .from('portfolio')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  const portfolioRows = rows ?? [];

  const assetRefs: AssetRef[] = portfolioRows.map((row) => ({
    ticker: row.ticker,
    assetType: row.asset_type,
    cryptoId: row.crypto_id
  }));

  // Moeda de exibição escolhida em Configurações: cripto vem nela e os ativos
  // da B3 são convertidos pela PTAX quando a exibição é em dólar.
  const money = await getMoneyContext();

  let quotes: Awaited<ReturnType<typeof getQuoteMap>> = new Map();

  try {
    const raw = await getQuoteMap(assetRefs, { currency: money.currency });
    quotes = quoteMapInCurrency(raw, money.currency, money.usdBrl);
  } catch {
    quotes = new Map();
  }

  const basePositions = buildPositions(portfolioRows, quotes, money);
  const baseSummary = summarizePositions(basePositions);
  const positions = withWeights(basePositions, baseSummary.totalValue);
  const summary = summarizePositions(positions);

  const totalByType = summary.valueByAssetType;
  const stockShare =
    summary.totalValue > 0 ? (totalByType.stock / summary.totalValue) * 100 : 0;
  const cryptoShare =
    summary.totalValue > 0 ? (totalByType.crypto / summary.totalValue) * 100 : 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Carteira</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Valores em {summary.currency === 'USD' ? 'dólares' : 'reais'}
            {summary.currency === 'USD' ? ' (bolsa convertida pela PTAX)' : ''}.
          </p>
        </div>

        <AutoRefresh label="Carteira" />
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Patrimônio"
          value={formatCurrency(summary.totalValue, summary.currency)}
          hint={`${summary.positionsCount} ${
            summary.positionsCount === 1 ? 'ativo' : 'ativos'
          } · ${summary.missingQuotesCount} sem cotação`}
          icon={<Wallet className="size-3.5" aria-hidden="true" />}
        />

        <StatCard
          label="Custo investido"
          value={formatCurrency(summary.totalCost, summary.currency)}
          hint={summary.totalCost > 0 ? 'Soma do preço médio × quantidade' : 'Sem preço médio informado'}
          icon={<Coins className="size-3.5" aria-hidden="true" />}
        />

        <StatCard
          label="Resultado"
          value={formatCurrency(summary.totalProfit, summary.currency)}
          tone={summary.totalProfit > 0 ? 'up' : summary.totalProfit < 0 ? 'down' : 'neutral'}
          hint={
            summary.totalProfitPercent !== null
              ? `${formatPercent(summary.totalProfitPercent)} sobre o custo`
              : 'Informe o preço médio para calcular'
          }
          icon={<TrendingUp className="size-3.5" aria-hidden="true" />}
        />

        <StatCard
          label="Alocação"
          value={`${formatPercent(stockShare)} / ${formatPercent(cryptoShare)}`}
          hint="Bolsa / Cripto"
          icon={<PieChart className="size-3.5" aria-hidden="true" />}
        />
      </section>

      {summary.totalValue > 0 ? (
        <div className="surface-card overflow-hidden p-0">
          <div className="flex h-2 w-full">
            <div
              className="bg-up"
              style={{ width: `${stockShare}%` }}
              title={`Bolsa: ${formatPercent(stockShare)}`}
            />
            <div
              className="bg-[#6366F1]"
              style={{ width: `${cryptoShare}%` }}
              title={`Cripto: ${formatPercent(cryptoShare)}`}
            />
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader
            title="Posições"
            description={
              summary.positionsCount === 0
                ? 'Nenhum ativo cadastrado'
                : 'Clique em editar para ajustar quantidade ou preço médio'
            }
          />

          {positions.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ink-muted">
              Use o formulário ao lado para adicionar seu primeiro ativo.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-faint">
                    <th className="px-4 py-2.5 font-medium sm:px-5">Ativo</th>
                    <th className="px-3 py-2.5 text-right font-medium">Qtd.</th>
                    <th className="px-3 py-2.5 text-right font-medium">Preço</th>
                    <th className="px-3 py-2.5 text-right font-medium">Dia</th>
                    <th className="px-3 py-2.5 text-right font-medium">Valor</th>
                    <th className="px-3 py-2.5 text-right font-medium">Result.</th>
                    <th className="px-4 py-2.5 text-right font-medium sm:px-5">Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {positions.map((position) => (
                    <tr key={position.id} className="border-b border-line/70 last:border-0">
                      <td className="px-4 py-3 sm:px-5">
                        <div className="flex items-center gap-2.5">
                          {position.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={position.logoUrl}
                              alt=""
                              width={28}
                              height={28}
                              className="size-7 shrink-0 rounded-full bg-surface-3 object-contain"
                              loading="lazy"
                            />
                          ) : (
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[10px] font-semibold text-ink-muted">
                              {position.ticker.slice(0, 2)}
                            </span>
                          )}

                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink">{position.ticker}</p>
                            <p className="truncate text-[11px] text-ink-faint">
                              {position.assetType === 'crypto' ? 'Cripto' : 'Bolsa'}
                              {position.weight !== null
                                ? ` · ${formatPercent(position.weight * 100)}`
                                : ''}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="numeric px-3 py-3 text-right text-ink-muted">
                        {formatQuantity(position.quantity)}
                      </td>

                      <td className="numeric px-3 py-3 text-right text-ink">
                        {formatPrice(position.price, position.currency)}
                      </td>

                      <td className="px-3 py-3 text-right">
                        <ChangePill value={position.changePercent} />
                      </td>

                      <td className="numeric px-3 py-3 text-right font-medium text-ink">
                        {formatCurrency(position.marketValue, position.currency)}
                      </td>

                      <td
                        className={`numeric px-3 py-3 text-right ${
                          position.profit === null
                            ? 'text-ink-faint'
                            : position.profit >= 0
                              ? 'text-up'
                              : 'text-down'
                        }`}
                      >
                        {position.profit === null
                          ? '—'
                          : formatCurrency(position.profit, position.currency)}
                        {position.profitPercent !== null ? (
                          <span className="block text-[11px] opacity-80">
                            {formatPercent(position.profitPercent)}
                          </span>
                        ) : null}
                      </td>

                      <td className="px-4 py-3 text-right sm:px-5">
                        <details className="relative inline-block text-left">
                          <summary className="cursor-pointer list-none rounded-[6px] border border-line px-2 py-1 text-[11px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink">
                            Editar
                          </summary>

                          <div className="absolute right-0 z-20 mt-1.5 w-64 rounded-[10px] border border-line bg-surface p-3 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.9)]">
                            <form action={savePositionAction} className="space-y-2.5">
                              <input type="hidden" name="id" value={position.id} />

                              <div>
                                <label
                                  className="label"
                                  htmlFor={`quantity-${position.id}`}
                                >
                                  Quantidade
                                </label>
                                <input
                                  id={`quantity-${position.id}`}
                                  name="quantity"
                                  type="number"
                                  step="any"
                                  min="0"
                                  defaultValue={position.quantity}
                                  required
                                  className="field"
                                />
                              </div>

                              <div>
                                <label
                                  className="label"
                                  htmlFor={`avg-${position.id}`}
                                >
                                  Preço médio (R$)
                                </label>
                                <input
                                  id={`avg-${position.id}`}
                                  name="avg_price"
                                  type="number"
                                  step="any"
                                  min="0"
                                  defaultValue={position.avgPriceBase ?? ''}
                                  placeholder="opcional"
                                  className="field"
                                />
                              </div>

                              <Button type="submit" size="sm" className="w-full">
                                Salvar
                              </Button>
                            </form>

                            <form action={deletePositionAction} className="mt-2">
                              <input type="hidden" name="id" value={position.id} />
                              <Button type="submit" variant="danger" size="sm" className="w-full">
                                Remover ativo
                              </Button>
                            </form>
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Adicionar ativo"
            description="Compra adicional do mesmo ativo soma a quantidade e recalcula o preço médio"
          />
          <div className="p-4 sm:p-5">
            <PositionForm />
          </div>
        </Card>
      </div>
    </div>
  );
}
