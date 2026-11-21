/**
 * Estados iniciais dos formulários que usam `useActionState`.
 *
 * Ficam fora dos arquivos `'use server'` de propósito: um módulo `'use server'`
 * só pode exportar funções assíncronas — exportar uma constante dali quebra o
 * build com "A 'use server' file can only export async functions, found object".
 */

export interface AuthFormState {
  status: 'idle' | 'error' | 'success';
  message: string | null;
  /** Devolvido para o formulário não perder o que o usuário digitou. */
  email?: string;
}

export const initialAuthState: AuthFormState = {
  status: 'idle',
  message: null
};

export interface PositionFormState {
  status: 'idle' | 'error' | 'success';
  message: string | null;
  fieldErrors?: Record<string, string>;
}

export const initialPositionState: PositionFormState = {
  status: 'idle',
  message: null
};

export interface AlertFormState {
  status: 'idle' | 'error' | 'success';
  message: string | null;
  fieldErrors?: Record<string, string>;
}

export const initialAlertState: AlertFormState = {
  status: 'idle',
  message: null
};
