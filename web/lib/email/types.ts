import type { AlertCondition, AssetType } from '@/lib/types/database';

export interface AlertEmailPayload {
  /** Destinatário. */
  to: string;
  ticker: string;
  assetName: string | null;
  assetType: AssetType;
  condition: AlertCondition;
  /** Preço-alvo configurado pelo usuário. */
  targetPrice: number;
  /** Preço de mercado no momento do disparo. */
  currentPrice: number;
  triggeredAt: Date;
}

export interface SendEmailResult {
  provider: 'resend' | 'smtp';
  messageId: string | null;
}

export type SendEmailFn = (payload: AlertEmailPayload) => Promise<SendEmailResult>;

export class EmailConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailConfigurationError';
  }
}
