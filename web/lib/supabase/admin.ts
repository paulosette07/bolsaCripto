import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { requireServerEnv } from '@/lib/env';
import type { Database } from '@/lib/types/database';

/**
 * Cliente com `service_role`: **ignora RLS**. Só pode ser importado por código
 * de servidor (o `server-only` acima garante erro de build se um Client
 * Component tentar). Usado exclusivamente por:
 *   - app/api/alerts/check/route.ts (cron de alertas)
 *
 * Nunca exponha este módulo a rotas públicas sem validar o CRON_SECRET antes.
 */
export function createAdminClient() {
  const url = requireServerEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = requireServerEnv('SUPABASE_SERVICE_ROLE_KEY');

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}
