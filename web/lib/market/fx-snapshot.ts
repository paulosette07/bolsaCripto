import type { UsdBrlRate } from './fx';

/**
 * Contrato JSON da taxa USD/BRL, consumido por três clientes:
 *
 *  - a faixa fixa do topo do app web (`components/layout/fx-ticker.tsx`);
 *  - `GET /api/fx`, público e cacheado por 5 minutos;
 *  - o app Windows (release), que consulta este servidor em vez de bater nas
 *    fontes com as próprias chaves.
 *
 * Só o que a tela usa viaja: o valor, a variação e a procedência. `previousRate`
 * fica de fora porque ninguém exibe a taxa anterior.
 */
export interface FxSnapshotJson {
  /** Quantos reais vale 1 dólar. `null` quando nenhuma fonte respondeu. */
  rate: number | null;
  /** Variação percentual contra o ponto anterior da série. */
  changePercent: number | null;
  /** Data de referência informada pela fonte (ISO `YYYY-MM-DD`). */
  referenceDate: string | null;
  source: 'bcb' | 'yahoo' | 'none';
  /** Momento da consulta, em ISO. */
  fetchedAt: string;
}

export function toFxSnapshot(rate: UsdBrlRate): FxSnapshotJson {
  return {
    rate: rate.rate,
    changePercent: rate.changePercent,
    referenceDate: rate.referenceDate,
    source: rate.source,
    fetchedAt: rate.fetchedAt
  };
}
