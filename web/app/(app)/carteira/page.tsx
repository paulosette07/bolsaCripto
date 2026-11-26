import type { Metadata } from 'next';
import { Bitcoin, Building2, Coins, TrendingUp } from 'lucide-react';

import { AutoRefresh } from '@/components/layout/auto-refresh';
import { PositionForm } from '@/components/portfolio/position-form';
import { StatCard } from '@/components/dashboard/stat-card';
import { deletePositionAction, savePositionAction } from '@/app/actions/portfolio';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { ChangePill } from '@/components/ui/delta';
import { formatCurrency, formatPercent, formatPrice, formatQuantity } from '@/lib/format';
import { getQuoteMapPartial } from '@/lib/market';
import type { AssetRef } from '@/lib/market/types';
import { quoteMapForDisplay } from '@/lib/money';
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

  // Moeda escolhida em Configurações: vale para cripto. Ações e FIIs ficam
  // sempre em reais — é onde são negociados e onde o custo foi digitado.
  const money = await getMoneyContext();

  // B3 e cripto são buscados em separado: um provedor fora do ar não pode
  // apagar o preço do outro.
  const rawQuotes = await getQuoteMapPartial(assetRefs, { currency: money.currency });
  const quotes = quoteMapForDisplay(rawQuotes, money.currency, money.usdBrl);

  const basePositions = buildPositions(portfolioRows, quotes, money);
  const positions = withWeights(basePositions);
  const summary = summarizePositions(positions, money);

  const stocks = summary.stocks;
  const crypto = summary.crypto;

  // A barra de alocação compara os dois grupos em reais.
  const totalInBrl = summary.totalValueBrl;
  const stockShare =
    totalInBrl > 0 ? (summary.valueByAssetTypeBrl.stock / totalInBrl) * 100 : 0;
  const cryptoShare =
    totalInBrl > 0 ? (summary.valueByAssetTypeBrl.crypto / totalInBrl) * 100 : 0;

  const stockTone =
    stocks.totalProfit > 0 ? 'up' : stocks.totalProfit < 0 ? 'down' : 'neutral';
  const cryptoTone =
    crypto.totalProfit > 0 ? 'up' : crypto.totalProfit < 0 ? 'down' : 'neutral';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Carteira</h1>
          <p className="mt-1 text-sm text-ink-muted">
            B3 em reais · cripto em {money.currency === 'USD' ? 'dólares' : 'reais'}.
          </p>
        </div>

        <AutoRefresh label="Carteira" />
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Patrimônio B3"
          value={formatCurrency(stocks.totalValue, stocks.currency)}
          hint={
            stocks.positionsCount === 0
              ? 'Nenhuma ação ou FII na carteira'
              : `Custo: ${formatCurrency(stocks.totalCost, stocks.currency)}`
          }
          icon={<Building2 className="size-3.5" aria-hidden="true" />}
        />

        <StatCard
          label="Cripto"
          value={formatCurrency(crypto.totalValue, crypto.currency)}
          hint={
            crypto.positionsCount === 0
              ? 'Nenhuma cripto na carteira'
              : `Custo: ${formatCurrency(crypto.totalCost, crypto.currency)}`
          }
          icon={<Bitcoin className="size-3.5" aria-hidden="true" />}
        />

        <StatCard
          label="Resultado B3"
          value={formatCurrency(stocks.totalProfit, stocks.currency)}
          tone={stockTone}
          hint={
            stocks.totalProfitPercent !== null
              ? `${formatPercent(stocks.totalProfitPercent)} sobre o custo`
              : stocks.positionsCount === 0
                ? 'Sem ativos da B3'
                : 'Informe o preço médio para calcular'
          }
          icon={<Coins className="size-3.5" aria-hidden="true" />}
        />

        <StatCard
          label="Resultado cripto"
          value={formatCurrency(crypto.totalProfit, crypto.currency)}
          tone={cryptoTone}
          hint={
            crypto.totalProfitPercent !== null
              ? `${formatPercent(crypto.totalProfitPercent)} sobre o custo`
              : crypto.positionsCount === 0
                ? 'Sem cripto na carteira'
                : 'Informe o preço médio para calcular'
          }
          icon={<TrendingUp className="size-3.5" aria-hidden="true" />}
        />
      </section>

      {totalInBrl > 0 ? (
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
