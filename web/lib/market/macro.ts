import { fetchJson } from './http';
import { getYahooSnapshot } from './yahoo';

/**
 * Indicadores macro do topo do painel: dólar, euro, ouro e Ibovespa.
 *
 * Duas fontes, escolhidas pelo que cada uma faz melhor:
 *
 *  - **AwesomeAPI** (`economia.awesomeapi.com.br`) devolve câmbio e ouro já em
 *    reais, com máxima/mínima do dia e variação percentual. Sem chave.
 *  - **Yahoo** cobre o Ibovespa (`^BVSP`), que a AwesomeAPI não tem, e serve de
 *    reserva para o câmbio quando a primeira falha.
 *
 * Nada aqui derruba o painel: cada bloco falha sozinho e o que respondeu é
 * exibido. Um card a menos é melhor que uma tela de erro.
 */

export type MacroId = 'usd-brl' | 'eur-brl' | 'gold' | 'ibov';

/**
 * Como o valor deve ser formatado:
 *  - `currency`: reais (cotação do dólar/euro);
 *  - `gold-gram`: reais por grama (o ouro é negociado em onça-troy);
 *  - `index`: pontos de índice (Ibovespa).
 */
export type MacroUnit = 'currency' | 'gold-gram' | 'index';

export interface MacroQuote {
  id: MacroId;
  label: string;
  subtitle: string;
  value: number;
  unit: MacroUnit;
  changePercent: number;
  changeValue: number;
  dayLow: number | null;
  dayHigh: number | null;
  /** Preço da onça-troy em dólar. Só o ouro preenche. */
  usdPerOunce: number | null;
  updatedAt: string;
}

export interface MacroOptions {
  noStore?: boolean;
}

/** Ordem fixa na tela: câmbio, metal, índice. */
export const MACRO_ORDER: readonly MacroId[] = ['usd-brl', 'eur-brl', 'gold', 'ibov'];

const AWESOME_FX_URL =
  'https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL,XAU-BRL';

const IBOVESPA_SYMBOL = '^BVSP';
const GOLD_FUTURES_SYMBOL = 'GC=F';

/** Onça-troy: 31,1034768 g. Padrão para ouro, prata e platina. */
const GRAMS_PER_TROY_OUNCE = 31.1034768;

interface AwesomePair {
  code?: string;
  name?: string;
  high?: string;
  low?: string;
  varBid?: string;
  pctChange?: string;
  bid?: string;
  timestamp?: string;
}

type AwesomeResponse = Record<string, AwesomePair>;

function parseNumber(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  const parsed = Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function timestampToIso(seconds: string | number | null | undefined): string {
  const parsed = parseNumber(seconds ?? null);

  if (parsed === null || parsed <= 0) {
    return new Date().toISOString();
  }

  return new Date(parsed * 1000).toISOString();
}

function pairToQuote(
  pair: AwesomePair | undefined,
  config: { id: MacroId; label: string; subtitle: string; unit: MacroUnit; scale: number }
): MacroQuote | null {
  const price = parseNumber(pair?.bid);

  if (!pair || price === null || price <= 0) {
    return null;
  }

  const value = price / config.scale;
  const percent = parseNumber(pair.pctChange) ?? 0;
  const absolute = parseNumber(pair.varBid);

  return {
    id: config.id,
    label: config.label,
    subtitle: config.subtitle,
    value,
    unit: config.unit,
    changePercent: percent,
    changeValue: absolute !== null ? absolute / config.scale : (value * percent) / (100 + percent),
    dayLow: scaleOrNull(parseNumber(pair.low), config.scale),
    dayHigh: scaleOrNull(parseNumber(pair.high), config.scale),
    usdPerOunce: null,
    updatedAt: timestampToIso(pair.timestamp)
  };
}

/**
 * Mínima/máxima do dia só valem quando positivas: em índices o Yahoo devolve
 * `regularMarketDayHigh/Low` como 0 fora do pregão, e "mín 0 · máx 0" na tela
 * seria pior que não mostrar a linha.
 */
function scaleOrNull(value: number | null, scale: number): number | null {
  return value === null || value <= 0 ? null : value / scale;
}

async function fetchAwesomePairs(options: MacroOptions): Promise<AwesomeResponse> {
  return fetchJson<AwesomeResponse>(AWESOME_FX_URL, {
    revalidateSeconds: 120,
    noStore: options.noStore
  });
}

function buildFromAwesomePair(pairs: AwesomeResponse): MacroQuote[] {
  const usd = pairToQuote(pairs.USDBRL, {
    id: 'usd-brl',
    label: 'Dólar',
    subtitle: 'USD → BRL · comercial',
    unit: 'currency',
    scale: 1
  });

  const eur = pairToQuote(pairs.EURBRL, {
    id: 'eur-brl',
    label: 'Euro',
    subtitle: 'EUR → BRL',
    unit: 'currency',
    scale: 1
  });

  const gold = pairToQuote(pairs.XAUBRL, {
    id: 'gold',
    label: 'Ouro',
    subtitle: 'grama · onça-troy',
    unit: 'gold-gram',
    scale: GRAMS_PER_TROY_OUNCE
  });

  const quotes: MacroQuote[] = [];

  if (usd) {
    quotes.push(usd);
  }

  if (eur) {
    quotes.push(eur);
  }

  if (gold) {
    // A série XAU-BRL é por onça: para exibir em dólar por onça basta dividir a
    // cotação da onça em reais pelo dólar do mesmo instante.
    const usdRate = usd?.value ?? null;
    const ounceBrl = gold.value * GRAMS_PER_TROY_OUNCE;

    quotes.push({
      ...gold,
      usdPerOunce: usdRate && usdRate > 0 ? ounceBrl / usdRate : null
    });
  }

  return quotes;
}

/** Reserva: monta o mesmo conjunto usando só o Yahoo. */
async function buildFromYahoo(options: MacroOptions): Promise<MacroQuote[]> {
  const [usdSnapshot, eurSnapshot, goldSnapshot] = await Promise.allSettled([
    getYahooSnapshot('USDBRL=X', options),
    getYahooSnapshot('EURBRL=X', options),
    getYahooSnapshot(GOLD_FUTURES_SYMBOL, options)
  ]);

  const quotes: MacroQuote[] = [];
  const usdRate = usdSnapshot.status === 'fulfilled' ? usdSnapshot.value.price : null;

  if (usdSnapshot.status === 'fulfilled') {
    quotes.push(snapshotToQuote(usdSnapshot.value, {
      id: 'usd-brl',
      label: 'Dólar',
      subtitle: 'USD → BRL · comercial',
      unit: 'currency',
      scale: 1
    }));
  }

  if (eurSnapshot.status === 'fulfilled') {
    quotes.push(snapshotToQuote(eurSnapshot.value, {
      id: 'eur-brl',
      label: 'Euro',
      subtitle: 'EUR → BRL',
      unit: 'currency',
      scale: 1
    }));
  }

  if (goldSnapshot.status === 'fulfilled' && usdRate && usdRate > 0) {
    const usdPerOunce = goldSnapshot.value.price;

    quotes.push({
      id: 'gold',
      label: 'Ouro',
      subtitle: 'grama · onça-troy',
      unit: 'gold-gram',
      value: (usdPerOunce * usdRate) / GRAMS_PER_TROY_OUNCE,
      changePercent: goldSnapshot.value.changePercent,
      changeValue:
        ((usdPerOunce * usdRate) / GRAMS_PER_TROY_OUNCE) *
        (goldSnapshot.value.changePercent / 100),
      dayLow: null,
      dayHigh: null,
      usdPerOunce,
      updatedAt: goldSnapshot.value.updatedAt
    });
  }

  return quotes;
}

function snapshotToQuote(
  snapshot: Awaited<ReturnType<typeof getYahooSnapshot>>,
  config: { id: MacroId; label: string; subtitle: string; unit: MacroUnit; scale: number }
): MacroQuote {
  const value = snapshot.price / config.scale;

  return {
    id: config.id,
    label: config.label,
    subtitle: config.subtitle,
    value,
    unit: config.unit,
    changePercent: snapshot.changePercent,
    changeValue: snapshot.changeValue / config.scale,
    dayLow: scaleOrNull(snapshot.dayLow, config.scale),
    dayHigh: scaleOrNull(snapshot.dayHigh, config.scale),
    usdPerOunce: null,
    updatedAt: snapshot.updatedAt
  };
}

async function getIbovespa(options: MacroOptions): Promise<MacroQuote | null> {
  try {
    const snapshot = await getYahooSnapshot(IBOVESPA_SYMBOL, options);

    return {
      ...snapshotToQuote(snapshot, {
        id: 'ibov',
        label: 'Ibovespa',
        subtitle: 'B3 · índice à vista',
        unit: 'index',
        scale: 1
      }),
      changeValue: snapshot.changeValue
    };
  } catch {
    return null;
  }
}

/**
 * Indicadores macro do painel, na ordem de `MACRO_ORDER`.
 * Lista vazia quando nenhuma fonte respondeu — quem chama decide o estado vazio.
 */
export async function getMacroQuotes(options: MacroOptions = {}): Promise<MacroQuote[]> {
  const [fx, ibov] = await Promise.all([
    fetchAwesomePairs(options).then(
      (pairs) => buildFromAwesomePair(pairs),
      () => buildFromYahoo(options).catch(() => [] as MacroQuote[])
    ),
    getIbovespa(options)
  ]);

  const byId = new Map<MacroId, MacroQuote>();

  for (const quote of fx) {
    byId.set(quote.id, quote);
  }

  if (ibov) {
    byId.set(ibov.id, ibov);
  }

  return MACRO_ORDER.map((id) => byId.get(id)).filter(
    (quote): quote is MacroQuote => quote !== undefined
  );
}
