import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  BellRing,
  Bitcoin,
  Building2,
  PieChart,
  TrendingUp,
  Wallet
} from 'lucide-react';

import { PriceChart } from '@/components/charts/price-chart';
import { AutoRefresh } from '@/components/layout/auto-refresh';
import { MacroStrip } from '@/components/dashboard/macro-strip';
import { RatesCard } from '@/components/dashboard/rates-card';
import { StatCard } from '@/components/dashboard/stat-card';
import { NewsBoard } from '@/components/news/news-board';
import { buttonClasses } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { ChangePill } from '@/components/ui/delta';
import { formatCurrency, formatPercent, formatPrice, toNumber } from '@/lib/format';
import { getHistory, getQuoteMapPartial } from '@/lib/market';
import { getMacroQuotes } from '@/lib/market/macro';
import { getMacroRates } from '@/lib/market/rates';
import type { MacroQuote } from '@/lib/market/macro';
import type { MacroRate } from '@/lib/market/rates';
import type { AssetRef } from '@/lib/market/types';
import { getNewsBoard } from '@/lib/news';
import type { NewsBoard as NewsBoardData } from '@/lib/news/types';
import { quoteMapForDisplay } from '@/lib/money';
import { buildPositions, summarizePositions, withWeights } from '@/lib/portfolio';
import { getMoneyContext } from '@/lib/preferences/display-currency';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Painel'
};

const MAX_POSITIONS_SHOWN = 5;

const EMPTY_NEWS: NewsBoardData = { brasil: [], economia: [], mundo: [] };

interface MarketContext {
  macroQuotes: MacroQuote[];
  macroRates: MacroRate[];
  news: NewsBoardData;
}

/**
 * Carrega o contexto de mercado (indicadores, juros e notícias).
 * Cada bloco falha em silêncio: um provedor fora do ar não pode esconder a
 * carteira do usuário.
 */
async function loadMarketContext(): Promise<MarketContext> {
  const [macroQuotes, macroRates, news] = await Promise.all([
    getMacroQuotes().catch(() => [] as MacroQuote[]),
    getMacroRates().catch(() => [] as MacroRate[]),
    getNewsBoard().catch(() => EMPTY_NEWS)
  ]);

  return { macroQuotes, macroRates, news };
}

function EmptyPortfolio() {
  return (
    <Card>
      <div className="flex flex-col items-center px-6 py-12 text-center">
        <span className="flex size-11 items-center justify-center rounded-[10px] border border-line bg-canvas text-up">
          <Wallet className="size-5" aria-hidden="true" strokeWidth={2} />
        </span>
        <h2 className="mt-4 text-base font-semibold tracking-tight text-ink">
          Sua carteira está vazia
        </h2>
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-muted">
          Cadastre a quantidade de ações, FIIs ou criptomoedas que você possui para acompanhar o
          patrimônio e o resultado em tempo real.
        </p>
        <Link href="/carteira" className={buttonClasses('primary', 'md', 'mt-5')}>
          Adicionar meu primeiro ativo
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </Card>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  // O layout já garante usuário; aqui é só para o TypeScript.
  if (!user) {
    return null;
  }

  const [{ data: portfolioRows }, { data: alertRows }, market] = await Promise.all([
    supabase
      .from('portfolio')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('price_alerts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false }),
    loadMarketContext()
  ]);

  const rows = portfolioRows ?? [];
  const alerts = alertRows ?? [];

  // Moeda escolhida em Configurações. Vale para cripto; ações e FIIs ficam
  // sempre em reais, porque é onde são negociados e onde o custo foi digitado.
  const money = await getMoneyContext();

  const assetRefs: AssetRef[] = rows.map((row) => ({
    ticker: row.ticker,
    assetType: row.asset_type,
    cryptoId: row.crypto_id
  }));

  // Falha de mercado não pode derrubar o painel: B3 e cripto são buscados em
  // separado, então um provedor fora do ar não apaga o outro.
  const rawQuotes = await getQuoteMapPartial(assetRefs, { currency: money.currency });
  const quotes = quoteMapForDisplay(rawQuotes, money.currency, money.usdBrl);

  const positions = buildPositions(rows, quotes, money);
  const summary = summarizePositions(positions, money);

  if (positions.length === 0) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Painel</h1>
          <p className="mt-1 text-sm text-ink-muted">Bem-vindo ao seu monitor de mercado.</p>
        </header>

        <MacroStrip quotes={market.macroQuotes} />

        <EmptyPortfolio />

        <section className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.55fr_1fr]">
          <NewsBoard board={market.news} />
          <RatesCard rates={market.macroRates} />
        </section>

        <Card>
          <CardHeader
            title="Alertas de preço"
            description="Nenhum alerta ativo no momento."
            action={
              <Link href="/alertas" className={buttonClasses('secondary', 'sm')}>
                Criar alerta
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  const ranked = withWeights(positions)
    .slice()
    .sort((a, b) => (b.marketValueBrl ?? 0) - (a.marketValueBrl ?? 0));

  const featured = ranked.find((position) => position.hasQuote) ?? ranked[0];
  const topPositions = ranked.slice(0, MAX_POSITIONS_SHOWN);

  let featuredPoints: Awaited<ReturnType<typeof getHistory>>['points'] = [];

  if (featured && featured.hasQuote) {
    try {
      const history = await getHistory(
        {
          ticker: featured.ticker,
          assetType: featured.assetType,
          cryptoId: featured.cryptoId
        },
        '1mo'
      );

      featuredPoints = history.points;
    } catch {
      featuredPoints = [];
    }
  }

  const stocks = summary.stocks;
  const crypto = summary.crypto;
  const stockTone =
    stocks.totalProfit > 0 ? 'up' : stocks.totalProfit < 0 ? 'down' : 'neutral';
  const cryptoTone =
    crypto.totalProfit > 0 ? 'up' : crypto.totalProfit < 0 ? 'down' : 'neutral';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Painel</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {summary.positionsCount}{' '}
            {summary.positionsCount === 1 ? 'ativo na carteira' : 'ativos na carteira'}
            {summary.missingQuotesCount > 0
              ? ` · ${summary.missingQuotesCount} sem cotação`
              : ''}
            {alerts.length > 0 ? ` · ${alerts.length} alertas ativos` : ''}
            {' · B3 em reais'}
            {money.currency === 'USD' ? ', cripto em dólares' : ', cripto em reais'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <AutoRefresh label="Painel" />
          <Link href="/carteira" className={buttonClasses('secondary', 'sm')}>
            Gerenciar carteira
          </Link>
        </div>
      </header>

      <MacroStrip quotes={market.macroQuotes} />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Patrimônio B3"
          value={formatCurrency(stocks.totalValue, stocks.currency)}
          hint={
            stocks.positionsCount === 0
              ? 'Nenhuma ação ou FII na carteira'
              : stocks.dayChangePercent !== null
                ? `${formatCurrency(stocks.dayChangeValue, stocks.currency)} hoje (${formatPercent(
                    stocks.dayChangePercent
                  )})`
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
              : crypto.dayChangePercent !== null
                ? `${formatCurrency(crypto.dayChangeValue, crypto.currency)} hoje (${formatPercent(
                    crypto.dayChangePercent
                  )})`
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
          icon={<TrendingUp className="size-3.5" aria-hidden="true" />}
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
          icon={<PieChart className="size-3.5" aria-hidden="true" />}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.55fr_1fr]">
        <Card>
          <CardHeader
            title={featured ? `${featured.ticker} · ${featured.name}` : 'Histórico'}
            description="Últimos 30 dias"
            action={
              featured ? (
                <Link
                  href={`/mercado?ticker=${encodeURIComponent(featured.ticker)}&type=${
                    featured.assetType
                  }${featured.cryptoId ? `&cryptoId=${featured.cryptoId}` : ''}`}
                  className="text-[11px] font-medium text-up underline-offset-4 hover:underline"
                >
                  Analisar
                </Link>
              ) : null
            }
          />

          <div className="px-4 pb-5 pt-4 sm:px-5">
            {featured ? (
              <PriceChart
                key={`${featured.assetType}-${featured.ticker}`}
                asset={{
                  ticker: featured.ticker,
                  assetType: featured.assetType,
                  cryptoId: featured.cryptoId
                }}
                initialRange="1mo"
                initialPoints={featuredPoints}
                changePercent={featured.changePercent}
                currency={featured.assetType === 'crypto' ? featured.currency : 'BRL'}
                height={260}
              />
            ) : (
              <p className="py-12 text-center text-sm text-ink-muted">
                Sem cotação disponível para montar o gráfico.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Maiores posições" description="Por valor de mercado" />

          <ul className="divide-y divide-line">
            {topPositions.map((position) => (
              <li
                key={position.id}
                className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  {position.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={position.logoUrl}
                      alt=""
                      width={26}
                      height={26}
                      className="size-6.5 shrink-0 rounded-full bg-surface-3 object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <span className="flex size-6.5 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[10px] font-semibold text-ink-muted">
                      {position.ticker.slice(0, 2)}
                    </span>
                  )}

                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{position.ticker}</p>
                    <p className="truncate text-[11px] text-ink-faint">
                      {position.hasQuote
                        ? `${formatQuantityShort(position.quantity)} × ${formatPrice(
                            position.price,
                            position.currency
                          )}`
                        : 'Sem cotação'}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <p className="numeric text-sm font-medium text-ink">
                    {formatCurrency(position.marketValue, position.currency)}
                  </p>
                  <div className="mt-0.5 flex justify-end">
                    <ChangePill value={position.changePercent} />
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="border-t border-line px-4 py-3 sm:px-5">
            <Link
              href="/carteira"
              className="inline-flex items-center gap-1 text-xs font-medium text-up underline-offset-4 hover:underline"
            >
              Ver carteira completa
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        </Card>
      </section>

      <section className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.55fr_1fr]">
        <NewsBoard board={market.news} />
        <RatesCard rates={market.macroRates} />
      </section>

      {alerts.length > 0 ? (
        <Card>
          <CardHeader
            title="Alertas ativos"
            description="Disparam e-mail quando o preço atingir a condição"
            action={
              <Link href="/alertas" className={buttonClasses('ghost', 'sm')}>
                Gerenciar
              </Link>
            }
          />

          <ul className="divide-y divide-line">
            {alerts.slice(0, 4).map((alert) => (
              <li
                key={alert.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <BellRing className="size-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
                  <p className="truncate text-sm text-ink">
                    <span className="font-medium">{alert.ticker}</span>{' '}
                    <span className="text-ink-muted">
                      {alert.condition === 'above' ? 'acima de' : 'abaixo de'}
                    </span>{' '}
                    <span className="numeric">{formatPrice(toNumber(alert.target_price))}</span>
                  </p>
                </div>

                <p className="numeric text-xs text-ink-faint">
                  {alert.last_checked_price
                    ? `último: ${formatPrice(toNumber(alert.last_checked_price))}`
                    : 'aguardando verificação'}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

/** Quantidade curta para caber na linha de detalhe. */
function formatQuantityShort(value: number): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 }).format(value);
}
