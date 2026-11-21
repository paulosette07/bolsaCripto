'use client';

import { Loader2, MailCheck, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useActionState } from 'react';

import { signUpAction } from '@/app/actions/auth';
import { initialAuthState } from '@/lib/forms/states';
import { Alert } from '@/components/ui/alert';
import { Button, buttonClasses } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';

const MIN_PASSWORD_LENGTH = 8;

export function RegisterForm() {
  const [state, formAction, isPending] = useActionState(signUpAction, initialAuthState);

  // Cadastro concluído: o Supabase exige confirmação por e-mail antes do login.
  if (state.status === 'success') {
    return (
      <div className="animate-rise">
        <span className="flex size-11 items-center justify-center rounded-[10px] border border-up/30 bg-up/8 text-up">
          <MailCheck className="size-5" aria-hidden="true" strokeWidth={2} />
        </span>

        <h2 className="mt-5 text-xl font-semibold tracking-tight text-ink">
          Confirme seu e-mail
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Enviamos um link de ativação
          {state.email ? (
            <>
              {' '}
              para <span className="font-medium text-ink">{state.email}</span>
            </>
          ) : null}
          . Sua conta só é liberada depois da confirmação — é assim que garantimos que a
          carteira e os alertas pertencem a você.
        </p>

        <Alert tone="info" className="mt-5">
          Não chegou? Verifique a caixa de spam. O link expira em 24 horas e só pode ser usado
          uma vez.
        </Alert>

        <Link href="/login" className={buttonClasses('secondary', 'md', 'mt-6 w-full')}>
          Voltar para o login
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-rise">
      <header className="mb-7">
        <h2 className="text-xl font-semibold tracking-tight text-ink">Criar conta</h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          Leva menos de um minuto para começar a monitorar.
        </p>
      </header>

      {state.status === 'error' && state.message ? (
        <Alert tone="error" className="mb-5">
          {state.message}
        </Alert>
      ) : null}

      <form action={formAction} className="space-y-4" noValidate>
        <Field label="Nome" htmlFor="full_name" hint="Opcional. Aparece no seu perfil.">
          <Input
            id="full_name"
            name="full_name"
            type="text"
            autoComplete="name"
            placeholder="Seu nome"
            maxLength={80}
          />
        </Field>

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
          />
        </Field>

        <Field
          label="Senha"
          htmlFor="password"
          hint={`Mínimo de ${MIN_PASSWORD_LENGTH} caracteres.`}
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        </Field>

        <Field label="Confirmar senha" htmlFor="password_confirmation">
          <Input
            id="password_confirmation"
            name="password_confirmation"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        </Field>

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Criando conta…
            </>
          ) : (
            <>
              <UserPlus className="size-4" aria-hidden="true" />
              Criar conta
            </>
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        Já tem conta?{' '}
        <Link
          href="/login"
          className="font-medium text-up underline-offset-4 transition-colors hover:underline"
        >
          Entrar
        </Link>
      </p>
    </div>
  );
}
