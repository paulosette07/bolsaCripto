import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/supabase/server';

/** A raiz não tem conteúdo próprio: manda para o painel ou para o login. */
export default async function RootPage() {
  const user = await getCurrentUser();

  redirect(user ? '/painel' : '/login');
}
