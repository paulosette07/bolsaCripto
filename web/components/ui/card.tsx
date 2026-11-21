import clsx from 'clsx';
import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  /** `flat` remove a borda — usado quando o card está dentro de outro. */
  variant?: 'default' | 'flat';
}

export function Card({ children, className, variant = 'default' }: CardProps) {
  return (
    <div
      className={clsx(
        'rounded-[12px]',
        variant === 'default' ? 'surface-card' : 'bg-transparent',
        className
      )}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function CardHeader({ title, description, action, className }: CardHeaderProps) {
  return (
    <div
      className={clsx(
        'flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4',
        className
      )}
    >
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
