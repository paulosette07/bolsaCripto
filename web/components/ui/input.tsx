import clsx from 'clsx';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}

/** Label + controle + mensagem. O erro sempre ocupa espaço reservado. */
export function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-down" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function Input({ className, invalid, ...rest }: InputProps) {
  return (
    <input
      className={clsx('field', invalid && 'border-down focus:border-down', className)}
      aria-invalid={invalid ? true : undefined}
      {...rest}
    />
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export function Select({ className, invalid, children, ...rest }: SelectProps) {
  return (
    <select
      className={clsx('field appearance-none pr-9', invalid && 'border-down', className)}
      aria-invalid={invalid ? true : undefined}
      {...rest}
    >
      {children}
    </select>
  );
}
