import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { ReactNode } from 'react';

type AlertTone = 'error' | 'success' | 'info';

interface AlertProps {
  tone: AlertTone;
  children: ReactNode;
  className?: string;
}

const TONE_STYLES: Record<AlertTone, { wrapper: string; icon: typeof Info }> = {
  error: {
    wrapper: 'border-down/30 bg-down/8 text-down',
    icon: AlertTriangle
  },
  success: {
    wrapper: 'border-up/30 bg-up/8 text-up',
    icon: CheckCircle2
  },
  info: {
    wrapper: 'border-line bg-surface-2 text-ink-muted',
    icon: Info
  }
};

export function Alert({ tone, children, className }: AlertProps) {
  const { wrapper, icon: Icon } = TONE_STYLES[tone];

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={clsx(
        'flex items-start gap-2.5 rounded-[8px] border px-3 py-2.5 text-xs leading-relaxed',
        wrapper,
        className
      )}
    >
      <Icon className="mt-px size-3.5 shrink-0" aria-hidden="true" strokeWidth={2.2} />
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}
