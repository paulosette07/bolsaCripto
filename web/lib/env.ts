/**
 * Acesso centralizado a variáveis de ambiente.
 *
 * Regras que este arquivo garante:
 *  - nunca lança erro no import (o build do Next avalia módulos no edge);
 *  - separa claramente o que é público (vai para o browser) do que é segredo.
 */

/**
 * Valores embutidos no bundle do cliente. Devem existir em build-time.
 *
 * `NEXT_PUBLIC_SITE_URL` não entra aqui de propósito: o domínio dos links de
 * e-mail vem do próprio request (`lib/config/site-url.ts`). A variável segue
 * aceita como fallback de servidor, mas um deploy feito com o `.env.local` de
 * desenvolvimento não gera mais links para localhost.
 */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
} as const;

/**
 * Lê uma variável obrigatória em runtime de servidor.
 * Chamada apenas dentro de handlers/actions — nunca no topo de um módulo.
 */
export function requireServerEnv(name: string): string {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(
      `Variável de ambiente ausente: ${name}. Configure em web/.env.local (local) ou nas Environment Variables da Vercel.`
    );
  }

  return value;
}

/** Usado pelas páginas para exibir aviso claro em vez de erro 500. */
export function isSupabaseConfigured(): boolean {
  return publicEnv.supabaseUrl.length > 0 && publicEnv.supabaseAnonKey.length > 0;
}

export const brapiToken = process.env.BRAPI_TOKEN ?? '';
export const cronSecret = process.env.CRON_SECRET ?? '';
export const emailProvider = (process.env.EMAIL_PROVIDER ?? 'resend').toLowerCase();
