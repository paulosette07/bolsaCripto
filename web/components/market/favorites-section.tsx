import { Star } from 'lucide-react';

import { FavoriteCard } from '@/components/market/favorite-card';
import { MAX_FAVORITES } from '@/lib/favorites';
import { assetKey } from '@/lib/market';
import type { Currency, Quote } from '@/lib/market/types';
import type { FavoriteRow } from '@/lib/types/database';

interface FavoritesSectionProps {
  favorites: readonly FavoriteRow[];
  /** Cotações indexadas por `assetKey`; vazio quando o provider falhou. */
  quotes: ReadonlyMap<string, Quote>;
  /** Moeda escolhida na página; os cards mostram e abrem o ativo nela. */
  currency: Currency;
}

/**
 * Faixa de favoritos no topo do Mercado.
 *
 * Sempre visível, inclusive vazia: é o lugar onde o usuário descobre que dá
 * para favoritar. Esconder a seção quando não há favoritos deixaria a estrela
 * do ativo sem explicação.
 */
export function FavoritesSection({ favorites, quotes, currency }: FavoritesSectionProps) {
  const atLimit = favorites.length >= MAX_FAVORITES;

  return (
    <section aria-labelledby="favoritos-titulo" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Star
            className="size-4 text-warn"
            fill="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <h2 id="favoritos-titulo" className="text-sm font-semibold tracking-tight text-ink">
            Favoritos
          </h2>

          {favorites.length > 0 ? (
            <span className="numeric rounded-full border border-line px-2 py-0.5 text-[10px] text-ink-faint">
              {favorites.length}/{MAX_FAVORITES}
            </span>
          ) : null}
        </div>

        {favorites.length > 0 ? (
          <p className="text-[11px] text-ink-faint">
            {atLimit
              ? 'Limite atingido — remova um favorito para adicionar outro.'
              : 'Clique no card para abrir a cotação completa.'}
          </p>
        ) : null}
      </div>

      {favorites.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-line bg-surface/40 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-warn">
              <Star className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </span>

            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">Nenhum ativo favoritado</p>
              <p className="mt-0.5 text-xs text-ink-muted">
                Abra um ativo e toque na estrela para acompanhá-lo aqui como card, com preço e
                variação do dia.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {favorites.map((favorite) => (
            <FavoriteCard
              key={`${favorite.asset_type}-${favorite.ticker}`}
              favorite={favorite}
              quote={quotes.get(assetKey(favorite.asset_type, favorite.ticker)) ?? null}
              currency={currency}
              atLimit={atLimit}
            />
          ))}
        </div>
      )}
    </section>
  );
}
