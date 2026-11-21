'use client';

import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useState } from 'react';

import { signInAction } from '@/app/actions/auth';
import { initialAuthState } from '@/lib/forms/states';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';

interface LoginFormProps {
  nextPath: string;
  notice?: string | null;
}

export function LoginForm({ nextPath, notice }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(signInAction, initialAuthState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="animate-rise">
      <header className="mb-7">
        <h2 className="text-xl font-semibold tracking-tight text-ink">Entrar na conta</h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          Acompanhe sua carteira e seus alertas de preço.
        </p>
      </header>

      {notice ? (
        <Alert tone="error" className="mb-5">
          {notice}
        </Alert>
      ) : null}

      {state.status === 'error' && state.message ? (
        <Alert tone="error" className="mb-5">
          {state.message}
        </Alert>
      ) : null}

      <form action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={nextPath} />

        <Field label="E-mail" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="voce@exemplo.com"
            defaultValue={state.email ?? ''}
            required
            autoFocus
          />
        </Field>

        <Field label="Senha" htmlFor="password">
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              required
              className="pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-faint transition-colors hover:text-ink"
            >
              {showPassword ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </Field>

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Entrando…
            </>
          ) : (
            <>
              <LogIn className="size-4" aria-hidden="true" />
              Entrar
            </>
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        Ainda não tem conta?{' '}
        <Link
          href="/cadastro"
          className="font-medium text-up underline-offset-4 transition-colors hover:underline"
        >
          Criar conta
        </Link>
      </p>
    </div>
  );
}
