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
  /** Headers extras do provider (sobrescrevem os padrões). */
  headers?: Record<string, string>;
}

const REQUEST_TIMEOUT_MS = 12_000;

function buildRequest(url: string, options: FetchJsonOptions): { url: string; init: RequestInit } {
  const { revalidateSeconds = 60, noStore = false, headers } = options;

  return {
    url,
    init: {
      headers: {
        accept: 'application/json',
        'user-agent': 'bolsa-monitor/1.0 (+https://github.com)',
        ...headers
      },
      ...(noStore
        ? { cache: 'no-store' as const }
        : { next: { revalidate: revalidateSeconds } })
    }
  };
}

/** GET de texto (RSS/XML) com o mesmo timeout e tradução de erro do JSON. */
export async function fetchText(url: string, options: FetchJsonOptions = {}): Promise<string> {
  const request = buildRequest(url, options);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(request.url, { ...request.init, signal: controller.signal });

    if (!response.ok) {
      throw new MarketDataError(
        `Falha ao consultar a fonte de dados (HTTP ${response.status}).`,
        response.status
      );
    }

    return await response.text();
  } catch (error) {
    throw toTransportError(error);
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Traduz falhas de rede/timeout em `MarketDataError` exibível. */
function toTransportError(error: unknown): MarketDataError {
  if (error instanceof MarketDataError) {
    return error;
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return new MarketDataError('A fonte de dados demorou demais para responder.', 504);
  }

  return new MarketDataError('Não foi possível consultar a fonte de dados.', 502);
}

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const request = buildRequest(url, options);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(request.url, { ...request.init, signal: controller.signal });

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
