import type { Metadata } from 'next';

import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Entrar'
};

const NOTICES: Record<string, string> = {
  link_expirado:
    'O link de confirmação expirou ou já foi usado. Entre com sua senha ou solicite um novo cadastro.',
  link_invalido: 'O link de confirmação é inválido. Verifique se copiou o endereço completo.',
  confirmacao: 'Não foi possível confirmar seu e-mail. Tente novamente.'
};

interface LoginPageProps {
  searchParams: Promise<{ next?: string; erro?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next, erro } = await searchParams;
  const notice = erro ? (NOTICES[erro] ?? NOTICES.link_invalido) : null;

  return <LoginForm nextPath={next ?? '/painel'} notice={notice ?? null} />;
}
