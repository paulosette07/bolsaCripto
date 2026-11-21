import clsx from 'clsx';
import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  /** Elemento à direita do rótulo, normalmente uma variação. */
  aside?: ReactNode;
  tone?: 'neutral' | 'up' | 'down';
  icon?: ReactNode;
}

const TONE_VALUE: Record<NonNullable<StatCardProps['tone']>, string> = {
  neutral: 'text-ink',
  up: 'text-up',
  down: 'text-down'
};

export function StatCard({ label, value, hint, aside, tone = 'neutral', icon }: StatCardProps) {
  return (
    <div className="surface-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {icon ? <span className="text-ink-faint">{icon}</span> : null}
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</p>
        </div>
        {aside}
      </div>

      <p className={clsx('numeric mt-2 text-xl font-semibold tracking-tight sm:text-2xl', TONE_VALUE[tone])}>
        {value}
      </p>

      {hint ? <p className="mt-1 text-xs text-ink-faint">{hint}</p> : null}
    </div>
  );
}
