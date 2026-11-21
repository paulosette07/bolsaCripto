import clsx from 'clsx';

interface BrandMarkProps {
  className?: string;
}

/** Marca do produto: barras crescentes em esmeralda sobre quadrado arredondado. */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label="Bolsa Monitor"
      className={clsx('size-8 shrink-0', className)}
    >
      <rect width="32" height="32" rx="9" fill="#10B981" />
      <rect x="7.5" y="17" width="4" height="8.5" rx="1.4" fill="#04140E" />
      <rect x="14" y="12.5" width="4" height="13" rx="1.4" fill="#04140E" />
      <rect x="20.5" y="7.5" width="4" height="18" rx="1.4" fill="#04140E" opacity="0.55" />
    </svg>
  );
}

interface BrandLockupProps {
  compact?: boolean;
  className?: string;
}

/** Marca + nome. `compact` esconde o texto em telas estreitas. */
export function BrandLockup({ compact = false, className }: BrandLockupProps) {
  return (
    <div className={clsx('flex items-center gap-2.5', className)}>
      <BrandMark />
      {compact ? null : (
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight text-ink">Bolsa Monitor</p>
          <p className="text-[11px] text-ink-faint">B3 e cripto em um só lugar</p>
        </div>
      )}
    </div>
  );
}
