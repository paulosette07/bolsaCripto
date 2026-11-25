import { fetchJson } from './http';

/**
 * Juros e inflação do Brasil, direto da API pública do Banco Central
 * (SGS — Sistema Gerenciador de Séries Temporais). Sem chave, sem cadastro.
 *
 * Séries usadas:
 *  - **432**: meta da taxa Selic (% ao ano), definida pelo Copom;
 *  - **13522**: IPCA acumulado em 12 meses (%).
 *
 * Ambas são a referência que o investidor pessoa física usa para comparar
 * renda fixa — faz sentido ficarem ao lado do dólar no painel.
 */

export type MacroRateId = 'selic' | 'ipca';

export interface MacroRate {
  id: MacroRateId;
  label: string;
  /** Valor em % (13.75 = 13,75% ao ano). */
  value: number;
  /** Data de referência informada pelo BCB, em ISO (`YYYY-MM-DD`). */
  referenceDate: string | null;
  note: string;
}

export interface RatesOptions {
  noStore?: boolean;
}

interface BcbPoint {
  data?: string;
  valor?: string;
}

const BCB_BASE_URL = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs';

const BCB_SERIES: Record<MacroRateId, { code: number; label: string; note: string }> = {
  selic: { code: 432, label: 'Selic', note: 'meta definida pelo Copom' },
  ipca: { code: 13522, label: 'IPCA', note: 'acumulado em 12 meses' }
};

function seriesUrl(code: number): string {
  return `${BCB_BASE_URL}.${code}/dados/ultimos/1?formato=json`;
}

/** `09/12/2026` (dd/MM/yyyy do BCB) -> `2026-12-09`. */
function bcbDateToIso(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());

  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

async function fetchRate(id: MacroRateId, options: RatesOptions): Promise<MacroRate | null> {
  const series = BCB_SERIES[id];

  const points = await fetchJson<BcbPoint[]>(seriesUrl(series.code), {
    revalidateSeconds: 21_600,
    noStore: options.noStore
  });

  const latest = points[points.length - 1];
  const parsed = latest?.valor ? Number.parseFloat(latest.valor) : Number.NaN;

  if (!latest || !Number.isFinite(parsed)) {
    return null;
  }

  return {
    id,
    label: series.label,
    value: parsed,
    referenceDate: bcbDateToIso(latest.data),
    note: series.note
  };
}

/** Selic e IPCA, na ordem em que aparecem no painel. Falhas são omitidas. */
export async function getMacroRates(options: RatesOptions = {}): Promise<MacroRate[]> {
  const settled = await Promise.allSettled([
    fetchRate('selic', options),
    fetchRate('ipca', options)
  ]);

  const rates: MacroRate[] = [];

  for (const entry of settled) {
    if (entry.status === 'fulfilled' && entry.value) {
      rates.push(entry.value);
    }
  }

  return rates;
}
