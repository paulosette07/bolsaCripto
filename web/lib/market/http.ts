/**
 * Helper de fetch para as APIs de mercado.
 *
 * Por que não usar `fetch` direto em cada provider:
 *  - timeout explícito (Brapi e CoinGecko podem pendurar a resposta);
 *  - erro tipado com status HTTP para virar mensagem decente na UI;
 *  - controle de cache em um só lugar: `revalidate` na UI, `no-store` no cron.
 */

export class MarketDataError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = 'MarketDataError';
    this.status = status;
  }
}

interface FetchJsonOptions {
  /** Segundos de cache no Data Cache do Next. Ignorado quando `noStore`. */
  revalidateSeconds?: number;
  /** Preço de alerta não pode vir do cache. */
  noStore?: boolean;
}

const REQUEST_TIMEOUT_MS = 12_000;

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const { revalidateSeconds = 60, noStore = false } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'bolsa-monitor/1.0 (+https://github.com)'
      },
      signal: controller.signal,
      ...(noStore
        ? { cache: 'no-store' as const }
        : { next: { revalidate: revalidateSeconds } })
    });

    if (!response.ok) {
      throw new MarketDataError(
        `Falha ao consultar a fonte de dados (HTTP ${response.status}).`,
        response.status
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof MarketDataError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new MarketDataError('A fonte de dados demorou demais para responder.', 504);
    }

    throw new MarketDataError('Não foi possível consultar a fonte de dados.', 502);
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Normaliza qualquer erro em uma mensagem exibível. */
export function toMarketErrorMessage(error: unknown): string {
  if (error instanceof MarketDataError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Erro inesperado ao consultar cotações.';
}
