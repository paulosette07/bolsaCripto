'use client';

import { createBrowserClient } from '@supabase/ssr';

import { publicEnv } from '@/lib/env';
import type { Database } from '@/lib/types/database';

/**
 * Cliente do browser. `createBrowserClient` mantém um singleton interno, então
 * chamar várias vezes devolve sempre a mesma instância (e o mesmo socket).
 */
export function createClient() {
  return createBrowserClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
}
