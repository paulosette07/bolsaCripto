import type { Metadata } from 'next';
import { MailWarning } from 'lucide-react';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/layout/app-shell';
import { BrandLockup } from '@/components/brand/logo';
import { createClient, getCurrentUser } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Painel'
};

/**
 * Segunda barreira de autenticação (a primeira é o `proxy.ts`).
 *
 * Aqui também barramos sessão sem e-mail confirmado: mesmo com cookie válido,
 * a conta só vale depois da confirmação.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (!user.email_confirmed_at) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-12">
        <div className="w-full max-w-md">
          <BrandLockup className="mb-8" />

          <div className="surface-card p-6">
            <span className="flex size-10 items-center justify-center rounded-[10px] border border-warn/30 bg-warn/10 text-warn">
              <MailWarning className="size-5" aria-hidden="true" strokeWidth={2} />
            </span>

            <h1 className="mt-4 text-lg font-semibold tracking-tight text-ink">
              Confirme seu e-mail para continuar
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              Enviamos um link de confirmação para{' '}
              <span className="font-medium text-ink">{user.email}</span>. Abra o e-mail e clique no
              link — depois volte e entre novamente.
            </p>

            <form action="/auth/sign-out" method="post" className="mt-6">
              <button
                type="submit"
                className="text-sm font-medium text-up underline-offset-4 hover:underline"
              >
                Sair e usar outra conta
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();

  return (
    <AppShell userEmail={user.email ?? ''} userName={profile?.full_name ?? null}>
      {children}
    </AppShell>
  );
}
