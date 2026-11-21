import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const BASE_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-[8px] font-medium transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-50 select-none whitespace-nowrap';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-up text-[#04140e] hover:bg-[#14c894] active:bg-[#0ea472]',
  secondary: 'bg-surface-2 text-ink border border-line hover:border-line-strong hover:bg-surface-3',
  ghost: 'text-ink-muted hover:text-ink hover:bg-surface-2',
  danger: 'text-down border border-down/30 hover:bg-down/10'
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm'
};

/** Compartilhado com `<Link>` para que links pareçam botões sem duplicar classe. */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string
): string {
  return clsx(BASE_CLASSES, VARIANT_CLASSES[variant], SIZE_CLASSES[size], className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={buttonClasses(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}
