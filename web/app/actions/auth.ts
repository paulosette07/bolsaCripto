'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { translateAuthError } from '@/lib/auth/messages';
import { publicEnv } from '@/lib/env';
import type { AuthFormState } from '@/lib/forms/states';
import { createClient } from '@/lib/supabase/server';

/**
 * Server Actions de autenticação.
 *
 * Tudo passa pelo servidor: a senha nunca é manipulada no browser e o cookie de
 * sessão é gravado pelo `@supabase/ssr` já com HttpOnly.
 */

const MIN_PASSWORD_LENGTH = 8;

/**
 * Só aceita destino interno. Impede open redirect via `?next=https://evil.com`
 * e via `//evil.com` (que o browser trata como protocol-relative).
 */
function safeNextPath(value: FormDataEntryValue | null): string {
  if (typeof value !== 'string') {
    return '/painel';
  }

  const trimmed = value.trim();

  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return '/painel';
  }

  return trimmed;
}

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === 'string' ? value.trim() : '';
}

export async function signInAction(
  _previousState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = readString(formData, 'email').toLowerCase();
  const password = formData.get('password');
  const nextPath = safeNextPath(formData.get('next'));

  if (!email || typeof password !== 'string' || password.length === 0) {
    return { status: 'error', message: 'Informe e-mail e senha.', email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    return { status: 'error', message: translateAuthError(error.message), email };
  }

  revalidatePath('/', 'layout');
  redirect(nextPath);
}

export async function signUpAction(
  _previousState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const fullName = readString(formData, 'full_name');
  const email = readString(formData, 'email').toLowerCase();
  const password = formData.get('password');
  const passwordConfirmation = formData.get('password_confirmation');

  if (!email) {
    return { status: 'error', message: 'Informe um e-mail válido.', email };
  }

  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return {
      status: 'error',
      message: `A senha precisa ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.`,
      email
    };
  }

  if (password !== passwordConfirmation) {
    return { status: 'error', message: 'As senhas não coincidem.', email };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName || null },
      emailRedirectTo: `${publicEnv.siteUrl}/auth/callback?next=/painel`
    }
  });

  if (error) {
    return { status: 'error', message: translateAuthError(error.message), email };
  }

  // Sessão imediata = confirmação de e-mail desligada no projeto.
  if (data.session) {
    revalidatePath('/', 'layout');
    redirect('/painel');
  }

  return {
    status: 'success',
    message: `Enviamos um link de confirmação para ${email}. Abra o e-mail para ativar sua conta.`,
    email
  };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath('/', 'layout');
  redirect('/login');
}
