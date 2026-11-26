import type { Metadata } from 'next';
import Link from 'next/link';
import { Bitcoin, Building2, Clock3 } from 'lucide-react';

import { PriceChart } from '@/components/charts/price-chart';
import { AutoRefresh } from '@/components/layout/auto-refresh';
import { CurrencyToggle } from '@/components/market/currency-toggle';
import { DividendCard } from '@/components/market/dividend-card';
import { FavoriteToggle } from '@/components/market/favorite-toggle';
import { FavoritesSection } from '@/components/market/favorites-section';
import { MarketNavSearch } from '@/components/market/market-nav-search';
import { buttonClasses } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { ChangePill } from '@/components/ui/delta';
import { isFavorited, MAX_FAVORITES, toAssetRef } from '@/lib/favorites';
import { formatCurrency, formatDateTime, formatPrice, formatRelativeTime, toNumber } from '@/lib/format';
import { getDividendMetrics } from '@/lib/market/fundamentals';
import { toMarketErrorMessage } from '@/lib/market/http';
import { getHistory, getQuoteMap, getSingleQuote } from '@/lib/market';
import { assetHref, currencyForAsset, isAssetType, parseCurrency } from '@/lib/market/types';
import type { AssetRef, Quote } from '@/lib/market/types';
import { convertAmount, quoteInCurrency, quoteMapInCurrency } from '@/lib/money';
import { getMoneyContext } from '@/lib/preferences/display-currency';
import { createClient } from '@/lib/supabase/server';
import type { FavoriteRow } from '@/lib/types/database';
import type { DividendMetrics } from '@/lib/market/fundamentals';

export const metadata: Metadata = {
  title: 'Mercado'
};

const SUGGESTIONS: { ticker: string; type: 'stock' | 'crypto'; cryptoId: string | null }[] = [
  { ticker: 'PETR4', type: 'stock', cryptoId: null },
  { ticker: 'VALE3', type: 'stock', cryptoId: null },
  { ticker: 'ITUB4', type: 'stock', cryptoId: null },
  { ticker: 'HGLG11', type: 'stock', cryptoId: null },
  { ticker: 'BBAS3', type: 'stock', cryptoId: null },
  { ticker: 'BTC', type: 'crypto', cryptoId: 'bitcoin' },
  { ticker: 'ETH', type: 'crypto', cryptoId: 'ethereum' },
  { ticker: 'SOL', type: 'crypto', cryptoId: 'solana' }
];

interface MarketPageProps {
  searchParams: Promise<{
    ticker?: string;
    type?: string;
    cryptoId?: string;
    currency?: string;
  }>;
}

export default async function MarketPage({ searchParams }: MarketPageProps) {
  const params = await searchParams;
  const ticker = params.ticker?.trim().toUpperCase() ?? '';
  const rawType = params.type;

  // Preferência salva em Configurações é o padrão; a URL (`?currency=usd`)
  // vence quando existe, porque é uma escolha explícita daquela cotação.
  const money = await getMoneyContext();
  const requestedCurrency = params.currency
    ? parseCurrency(params.currency, money.currency)
    : money.currency;

  const asset: AssetRef | null =
    ticker.length > 0 && isAssetType(rawType)
      ? {
          ticker,
          assetType: rawType,
          cryptoId: params.cryptoId && params.cryptoId.length > 0 ? params.cryptoId : null
        }
      : null;

  /**
   * Moeda da cotação exibida.
   *
   * Cripto alterna livremente (real ↔ dólar). Bolsa é negociada em reais: o
   * preço grande continua em BRL e, em modo dólar, mostramos a conversão ao
   * lado — trocar o eixo do gráfico por um câmbio do dia enganaria mais do que
   * ajudaria.
   */
  const currency = asset ? currencyForAsset(asset.assetType, requestedCurrency) : requestedCurrency;
  const canSwitchCurrency = asset?.assetType === 'crypto';

  // Favoritos são lidos antes da cotação do ativo: a seção aparece no topo da
  // página e não depende do ativo selecionado.
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  let favorites: FavoriteRow[] = [];
  let favoritesMessage: string | null = null;

  if (user) {
    const { data, error } = await supabase
      .from('favorites')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) {
      favoritesMessage =
        error.code === 'PGRST205'
          ? 'Favoritos ainda não estão ativos neste projeto: rode web/supabase/migrations/0002_favorites.sql no SQL Editor do Supabase.'
          : 'Não foi possível carregar seus favoritos agora. Tente recarregar a página.';
    } else {
      favorites = (data ?? []).slice(0, MAX_FAVORITES);
    }
  }

  let favoriteQuotes = new Map<string, Quote>();

  if (favorites.length > 0) {
    try {
      // Cripto já vem na moeda pedida; bolsa vem em reais e é convertida quando
      // a exibição é em dólar — assim o card não mistura duas moedas.
      const raw = await getQuoteMap(favorites.map(toAssetRef), {
        currency: requestedCurrency
      });

      favoriteQuotes = quoteMapInCurrency(raw, requestedCurrency, money.usdBrl);
    } catch {
      favoriteQuotes = new Map();
    }
  }

  const atFavoriteLimit = favorites.length >= MAX_FAVORITES;

  let quote: Quote | null = null;
  let points: Awaited<ReturnType<typeof getHistory>>['points'] = [];
  let errorMessage: string | null = null;
  let dividends: DividendMetrics | null = null;
  let positionQuantity: number | null = null;

  if (asset) {
    try {
      const [quoteResult, history] = await Promise.all([
        getSingleQuote(asset, { currency }),
        getHistory(asset, '1mo', { currency })
      ]);

      // A cotação de bolsa chega em BRL mesmo quando a exibição é dólar.
      quote = quoteResult ? quoteInCurrency(quoteResult, requestedCurrency, money.usdBrl) : null;
      points = history.points;

      if (!quote) {
        errorMessage = `Não encontramos cotação para "${asset.ticker}". Confira o código do ativo.`;
      }
    } catch (error) {
      errorMessage = toMarketErrorMessage(error);
    }

    // Proventos só existem para bolsa/FII; e a projeção de renda precisa da
    // quantidade que o usuário já tem na carteira.
    if (asset.assetType === 'stock' && !errorMessage) {
      // Provento é pago em reais: o yield usa o preço em BRL mesmo em modo dólar.
      const priceInBrl = quote
        ? convertAmount(quote.price, quote.currency, 'BRL', money.usdBrl)
        : null;

      const [metricsResult, positionResult] = await Promise.all([
        getDividendMetrics(asset.ticker, priceInBrl),
        user
          ? supabase
              .from('portfolio')
              .select('quantity')
              .eq('user_id', user.id)
              .eq('ticker', asset.ticker)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null })
      ]);

      dividends = metricsResult;
      positionQuantity = toNumber(positionResult.data?.quantity ?? null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">Mercado</h1>
            <p className="mt-1 text-sm text-ink-muted">
              Cotações da B3 com proventos e criptomoedas em {requestedCurrency === 'USD' ? 'dólar' : 'real'}.
            </p>
          </div>

          <AutoRefresh label="Mercado" />
        </div>

        <MarketNavSearch currency={requestedCurrency} />
      </header>

      {favoritesMessage ? (
        <Alert tone="info">{favoritesMessage}</Alert>
      ) : (
        <FavoritesSection
          favorites={favorites}
          quotes={favoriteQuotes}
          currency={requestedCurrency}
        />
      )}

      {errorMessage ? <Alert tone="error">{errorMessage}</Alert> : null}

      {!asset ? (
        <Card>
          <CardHeader
            title="Escolha um ativo"
            description="Busque acima ou comece por um destes"
          />

          <div className="flex flex-wrap gap-2 p-4 sm:p-5">
            {SUGGESTIONS.map((suggestion) => {
              const href = assetHref(
                {
                  ticker: suggestion.ticker,
                  assetType: suggestion.type,
                  cryptoId: suggestion.cryptoId
                },
                { currency: requestedCurrency }
              );

              return (
                <Link
                  key={`${suggestion.type}-${suggestion.ticker}`}
                  href={href}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                >
                  {suggestion.type === 'crypto' ? (
                    <Bitcoin className="size-3.5 text-up" aria-hidden="true" />
                  ) : (
                    <Building2 className="size-3.5 text-ink-faint" aria-hidden="true" />
                  )}
                  {suggestion.ticker}
                </Link>
              );
            })}
          </div>

          <p className="border-t border-line px-4 py-3 text-[11px] text-ink-faint sm:px-5">
            Criptomoedas alternam entre real e dólar no topo da cotação — e a escolha vira o padrão do
            app, ajustável em Configurações.
          </p>
        </Card>
      ) : null}

      {asset && quote ? (
        <>
          <section className="surface-card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {quote.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={quote.logoUrl}
                      alt=""
                      width={32}
                      height={32}
                      className="size-8 rounded-full bg-surface-3 object-contain"
                    />
                  ) : null}

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold tracking-tight text-ink">
                        {quote.ticker}
                      </h2>
                      <span className="rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-faint">
                        {quote.assetType === 'crypto' ? 'Cripto' : 'B3'}
                      </span>
                    </div>
                    <p className="truncate text-xs text-ink-muted">{quote.name}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {canSwitchCurrency ? (
                    <CurrencyToggle asset={asset} currency={currency} />
                  ) : null}

                  <FavoriteToggle
                    ticker={quote.ticker}
                    assetType={quote.assetType}
                    cryptoId={quote.cryptoId}
                    isFavorite={isFavorited(favorites, {
                      assetType: quote.assetType,
                      ticker: quote.ticker
                    })}
                    variant="label"
                    disabled={atFavoriteLimit}
                  />
                </div>
              </div>

              <div className="text-right">
                <p className="numeric text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                  {formatPrice(quote.price, quote.currency)}
                </p>
                <div className="mt-1 flex items-center justify-end gap-2">
                  <ChangePill value={quote.changePercent} />
                  <span className="numeric text-xs text-ink-faint">
                    {formatCurrency(quote.changeValue, quote.currency)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line pt-3 text-[11px] text-ink-faint">
              <span className="inline-flex items-center gap-1">
                <Clock3 className="size-3" aria-hidden="true" />
                Atualizado {formatRelativeTime(quote.updatedAt)}
              </span>
              <span>Fonte: {quote.assetType === 'crypto' ? 'CoinGecko' : 'Brapi/Yahoo'}</span>
              <span className="numeric">
                Moeda: {quote.currency === 'USD' ? 'dólar (USD)' : 'real (BRL)'}
              </span>
              <span className="numeric">{formatDateTime(quote.updatedAt)}</span>
            </div>
          </section>

          {asset.assetType === 'stock' ? (
            <DividendCard metrics={dividends} quantity={positionQuantity} />
          ) : null}

          <Card>
            <CardHeader
              title={`Histórico de ${quote.ticker}`}
              description={currency === 'USD' ? 'Preços em dólares' : 'Preços em reais'}
              action={
                <Link href="/carteira" className={buttonClasses('secondary', 'sm')}>
                  Adicionar à carteira
                </Link>
              }
            />

            <div className="px-4 pb-5 pt-4 sm:px-5">
              <PriceChart
                key={`${asset.assetType}-${asset.ticker}-${currency}`}
                asset={asset}
                initialRange="1mo"
                initialPoints={points}
                changePercent={quote.changePercent}
                currency={currency}
                height={340}
              />
            </div>
          </Card>
        </>
      ) : null}

      {asset && !quote && !errorMessage ? (
        <Alert tone="info">Carregando cotação…</Alert>
      ) : null}
    </div>
  );
}
