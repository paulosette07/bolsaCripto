import { isAssetType, isCurrency } from '@/lib/market/types';
import type { AssetRef, Currency } from '@/lib/market/types';

/**
 * Validação do corpo das rotas `/api/app/*` — a API que o app Windows usa.
 *
 * É o mesmo contrato de `/api/quotes`, isolado aqui porque agora há dois
 * clientes (a própria web e o desktop) e duplicar a validação significaria
 * dois lugares para esquecer de atualizar quando o formato mudar.
 */

/** Teto de ativos por requisição: uma carteira grande ainda cabe em duas. */
export const MAX_ASSETS_PER_REQUEST = 60;

/**
 * Lê `{ assets: [{ ticker, assetType, cryptoId }] }`.
 * Devolve `null` em qualquer entrada inválida — nunca um lote parcial.
 */
export function parseAssetRefs(payload: unknown): AssetRef[] | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { assets } = payload as { assets?: unknown };

  if (!Array.isArray(assets) || assets.length === 0 || assets.length > MAX_ASSETS_PER_REQUEST) {
    return null;
  }

  const parsed: AssetRef[] = [];

  for (const entry of assets) {
    if (typeof entry !== 'object' || entry === null) {
      return null;
    }

    const { ticker, assetType, cryptoId } = entry as {
      ticker?: unknown;
      assetType?: unknown;
      cryptoId?: unknown;
    };

    if (typeof ticker !== 'string' || ticker.trim().length === 0) {
      return null;
    }

    if (!isAssetType(assetType)) {
      return null;
    }

    parsed.push({
      ticker: ticker.trim().toUpperCase(),
      assetType,
      cryptoId: typeof cryptoId === 'string' && cryptoId.length > 0 ? cryptoId : null
    });
  }

  return parsed;
}

/** Moeda pedida no corpo (`'BRL' | 'USD'`); `null` quando ausente ou inválida. */
export function parseRequestedCurrency(payload: unknown): Currency | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { currency } = payload as { currency?: unknown };

  return isCurrency(currency) ? currency : null;
}

/** Corpo JSON do request, ou `undefined` quando o corpo não é JSON válido. */
export async function readJsonBody(request: Request): Promise<unknown | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
