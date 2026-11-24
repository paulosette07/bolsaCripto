'use client';

import clsx from 'clsx';
import { Loader2, Star } from 'lucide-react';
import { useFormStatus } from 'react-dom';

import { toggleFavoriteAction } from '@/app/actions/favorites';
import type { AssetType } from '@/lib/types/database';

interface FavoriteToggleProps {
  ticker: string;
  assetType: AssetType;
  cryptoId: string | null;
  isFavorite: boolean;
  /** `icon` é a estrela solta do card; `label` mostra o texto ao lado. */
  variant?: 'icon' | 'label';
  /** Bloqueia favoritar quando o limite foi atingido (remover continua livre). */
  disabled?: boolean;
  className?: string;
}

const BASE_CLASSES =
  'inline-flex items-center justify-center gap-1.5 rounded-full border transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-45';

const VARIANT_CLASSES: Record<NonNullable<FavoriteToggleProps['variant']>, string> = {
  icon: 'size-7',
  label: 'h-8 px-3 text-xs font-medium'
};

const TONE_CLASSES = {
  on: 'border-warn/40 bg-warn/10 text-warn hover:bg-warn/15',
  off: 'border-line bg-canvas text-ink-faint hover:border-line-strong hover:text-ink'
} as const;

interface FavoriteSubmitProps extends FavoriteToggleProps {
  variant: NonNullable<FavoriteToggleProps['variant']>;
}

/**
 * O estado pendente vive no botão, não no formulário: `useFormStatus` só
 * enxerga o submit quando ele é filho do `<form>`.
 */
function FavoriteSubmit({ isFavorite, variant, disabled, ticker }: FavoriteSubmitProps) {
  const { pending } = useFormStatus();
  const label = isFavorite ? 'Favoritado' : 'Favoritar';

  return (
    <button
      type="submit"
      aria-pressed={isFavorite}
      aria-label={`${label} ${ticker}`}
      title={disabled ? 'Limite de favoritos atingido' : label}
      disabled={disabled || pending}
      className={clsx(
        BASE_CLASSES,
        VARIANT_CLASSES[variant],
        isFavorite ? TONE_CLASSES.on : TONE_CLASSES.off
      )}
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Star
          className="size-3.5 shrink-0"
          strokeWidth={2}
          fill={isFavorite ? 'currentColor' : 'none'}
          aria-hidden="true"
        />
      )}

      {variant === 'label' ? <span>{pending ? 'Salvando…' : label}</span> : null}
    </button>
  );
}

/**
 * Estrela de favorito. É um `<form>` de server action: funciona sem JavaScript
 * no cliente e não exige estado espelhado da lista de favoritos.
 */
export function FavoriteToggle({
  ticker,
  assetType,
  cryptoId,
  isFavorite,
  variant = 'icon',
  disabled = false,
  className
}: FavoriteToggleProps) {
  return (
    <form action={toggleFavoriteAction} className={clsx('inline-flex', className)}>
      <input type="hidden" name="ticker" value={ticker} />
      <input type="hidden" name="asset_type" value={assetType} />
      {cryptoId ? <input type="hidden" name="crypto_id" value={cryptoId} /> : null}

      <FavoriteSubmit
        ticker={ticker}
        assetType={assetType}
        cryptoId={cryptoId}
        isFavorite={isFavorite}
        variant={variant}
        disabled={disabled && !isFavorite}
      />
    </form>
  );
}
