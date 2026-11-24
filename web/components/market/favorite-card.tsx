import Link from 'next/link';
import { TrendingDown, TrendingUp } from 'lucide-react';

import { ChangePill } from '@/components/ui/delta';
import { formatPrice } from '@/lib/format';
import { assetHref } from '@/lib/market/types';
import type { Currency, Quote } from '@/lib/market/types';
import { toAssetRef } from '@/lib/favorites';
import type { FavoriteRow } from '@/lib/types/database';

import { FavoriteToggle } from './favorite-toggle';

interface FavoriteCardProps {
  favorite: FavoriteRow;
  quote: Quote | null;
  /** Moeda escolhida na página: o card abre o ativo sem trocar de moeda. */
  currency: Currency;
  /** Verdadeiro quando o usuário já usou todos os favoritos disponíveis. */
  atLimit: boolean;
}

/**
 * Card de favorito no Mercado: preço, variação e um atalho para o gráfico.
 *
 * O link cobre o card inteiro (área clicável grande) e a estrela fica acima
 * dele em `z-10` — assim o mesmo card abre o ativo e permite desfavoritar sem
 * aninhar botão dentro de link.
 */
export function FavoriteCard({ favorite, quote, currency, atLimit }: FavoriteCardProps) {
  const asset = toAssetRef(favorite);
  const href = assetHref(asset, { currency });
  const isUp = (quote?.changePercent ?? 0) > 0;
  const ChangeIcon = isUp ? TrendingUp : TrendingDown;

  return (
    <article className="surface-card group relative flex flex-col gap-3 overflow-hidden p-4 transition-colors hover:border-line-strong hover:bg-surface-2">
      <Link
        href={href}
        className="absolute inset-0 z-0"
        aria-label={`Abrir ${favorite.ticker} no Mercado`}
      />

      <div className="relative z-10 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {quote?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={quote.logoUrl}
              alt=""
              width={28}
              height={28}
              className="size-7 shrink-0 rounded-full bg-surface-3 object-contain"
              loading="lazy"
            />
          ) : (
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[10px] font-semibold text-ink-muted">
              {favorite.ticker.slice(0, 2)}
            </span>
          )}

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-ink">
              {favorite.ticker}
            </p>
            <p className="truncate text-[11px] text-ink-faint">
              {quote?.name ?? (favorite.asset_type === 'crypto' ? 'Criptomoeda' : 'Bolsa')}
            </p>
          </div>
        </div>

        <div className="pointer-events-auto">
          <FavoriteToggle
            ticker={favorite.ticker}
            assetType={favorite.asset_type}
            cryptoId={favorite.crypto_id}
            isFavorite
            disabled={atLimit}
          />
        </div>
      </div>

      <div className="pointer-events-none relative z-10 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="numeric truncate text-base font-semibold tracking-tight text-ink">
            {quote ? formatPrice(quote.price, quote.currency) : '—'}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-faint">
            <ChangeIcon className="size-3" aria-hidden="true" />
            {quote ? 'hoje' : 'sem cotação'}
          </p>
        </div>

        {quote ? <ChangePill value={quote.changePercent} /> : null}
      </div>
    </article>
  );
}
