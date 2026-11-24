/**
 * Tipos do schema `public` do Supabase.
 *
 * Espelha web/supabase/migrations/0001_init.sql. Mantido à mão de propósito:
 * gerar via CLI exigiria `supabase link` + senha do banco, e o schema é pequeno.
 * Se o SQL mudar, este arquivo precisa mudar junto.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AssetType = 'stock' | 'crypto';
export type AlertCondition = 'above' | 'below';
export type AlertProvider = 'resend' | 'smtp';
export type AlertSentVia = 'email' | 'cron' | 'desktop';
export type AlertStatus = 'sent' | 'failed';

/*
 * Declarados como `type` e NÃO como `interface`, de propósito.
 *
 * O supabase-js exige que `Row` seja atribuível a `Record<string, unknown>`.
 * Interfaces não ganham index signature implícita em TypeScript; type aliases
 * ganham. Trocar `type` por `interface` aqui faz todo `.select()` virar `never`.
 */
export type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  updated_at: string;
};

export type PortfolioRow = {
  id: string;
  user_id: string;
  ticker: string;
  asset_type: AssetType;
  crypto_id: string | null;
  quantity: string;
  avg_price: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FavoriteRow = {
  id: string;
  user_id: string;
  ticker: string;
  asset_type: AssetType;
  crypto_id: string | null;
  created_at: string;
};

export type PriceAlertRow = {
  id: string;
  user_id: string;
  ticker: string;
  asset_type: AssetType;
  crypto_id: string | null;
  condition: AlertCondition;
  target_price: string;
  is_active: boolean;
  cooldown_minutes: number;
  last_notified_at: string | null;
  last_checked_price: string | null;
  created_at: string;
  updated_at: string;
};

export type AlertEventRow = {
  id: string;
  alert_id: string | null;
  user_id: string;
  ticker: string;
  asset_type: AssetType;
  condition: AlertCondition;
  target_price: string;
  price_at_trigger: string;
  sent_via: AlertSentVia;
  provider: string | null;
  status: AlertStatus;
  error_message: string | null;
  created_at: string;
};

/**
 * `numeric` do Postgres chega como string no PostgREST (para não perder
 * precisão). Mantemos string na Row e convertemos para number na camada de
 * domínio — nunca antes de somar.
 */
export interface Database {
  /**
   * Marca de versão exigida pelo supabase-js v2 recente para resolver o schema
   * corretamente. Sem este bloco o parser de tipos degrada para `never` em
   * `.select()` e perde-se toda a inferência de colunas.
   */
  __InternalSupabase: {
    PostgrestVersion: string;
  };
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      portfolio: {
        Row: PortfolioRow;
        Insert: {
          id?: string;
          user_id: string;
          ticker: string;
          asset_type: AssetType;
          crypto_id?: string | null;
          quantity: number | string;
          avg_price?: number | string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          ticker?: string;
          asset_type?: AssetType;
          crypto_id?: string | null;
          quantity?: number | string;
          avg_price?: number | string | null;
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      favorites: {
        Row: FavoriteRow;
        Insert: {
          id?: string;
          user_id: string;
          ticker: string;
          asset_type: AssetType;
          crypto_id?: string | null;
          created_at?: string;
        };
        Update: {
          ticker?: string;
          asset_type?: AssetType;
          crypto_id?: string | null;
        };
        Relationships: [];
      };
      price_alerts: {
        Row: PriceAlertRow;
        Insert: {
          id?: string;
          user_id: string;
          ticker: string;
          asset_type: AssetType;
          crypto_id?: string | null;
          condition: AlertCondition;
          target_price: number | string;
          is_active?: boolean;
          cooldown_minutes?: number;
          last_notified_at?: string | null;
          last_checked_price?: number | string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          ticker?: string;
          asset_type?: AssetType;
          crypto_id?: string | null;
          condition?: AlertCondition;
          target_price?: number | string;
          is_active?: boolean;
          cooldown_minutes?: number;
          last_notified_at?: string | null;
          last_checked_price?: number | string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      alert_events: {
        Row: AlertEventRow;
        Insert: {
          id?: string;
          alert_id?: string | null;
          user_id: string;
          ticker: string;
          asset_type: AssetType;
          condition: AlertCondition;
          target_price: number | string;
          price_at_trigger: number | string;
          sent_via?: AlertSentVia;
          provider?: string | null;
          status?: AlertStatus;
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          status?: AlertStatus;
          error_message?: string | null;
        };
        Relationships: [];
      };
    };
    // A forma `{ [_ in never]: never }` (e não `Record<never, never>`) é a que
    // o Supabase gera. A diferença importa: sem ela o schema não satisfaz a
    // constraint `GenericSchema` do supabase-js e todo `.select()` vira `never`.
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      asset_type: AssetType;
      alert_condition: AlertCondition;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
