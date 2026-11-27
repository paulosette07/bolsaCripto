/**
 * Helper de fetch para as APIs de mercado.
 *
 * Por que não usar `fetch` direto em cada provider:
 *  - timeout explícito (Brapi e CoinGecko podem pendurar a resposta);
 *  - erro tipado com status HTTP para virar mensagem decente na UI;
 *  - controle de cache em um só lugar: `revalidate` na UI, `no-store` no cron;
 *  - uma repetição automática quando a fonte responde 429/503, que é o modo
 *    normal de falha dos provedores públicos (rate limit por IP).
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

/** Tentativas totais em falhas passageiras (429/503). Uma repetição basta. */
const MAX_ATTEMPTS = 2;

/** Espera entre tentativas. Ficar mais tempo que isso só atrasa a tela. */
const RETRY_DELAY_MS = 700;

const MAX_RETRY_DELAY_MS = 1_500;

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

/** Falha transitória: vale repetir em vez de mostrar erro na tela. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 503;
}

function errorForStatus(status: number): MarketDataError {
  if (status === 429) {
    return new MarketDataError(
      'A fonte de dados limitou as consultas agora (HTTP 429). Aguarde alguns segundos e tente novamente.',
      429
    );
  }

  if (status === 503) {
    return new MarketDataError(
      'A fonte de dados está indisponível agora (HTTP 503). Tente novamente em instantes.',
      503
    );
  }

  return new MarketDataError(`Falha ao consultar a fonte de dados (HTTP ${status}).`, status);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Respeita `Retry-After` quando a fonte informa, com teto para não travar a tela. */
function retryDelayMs(response: Response): number {
  const header = response.headers.get('retry-after');

  if (header === null) {
    return RETRY_DELAY_MS;
  }

  const seconds = Number.parseInt(header, 10);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return RETRY_DELAY_MS;
  }

  return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
}

/** GET com timeout, repetição em 429/503 e erro tipado. */
async function requestWithRetry(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const isLastAttempt = attempt === MAX_ATTEMPTS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });

      if (response.ok) {
        return response;
      }

      const error = errorForStatus(response.status);

      if (isLastAttempt || !isRetryableStatus(response.status)) {
        throw error;
      }

      await delay(retryDelayMs(response));
    } catch (error) {
      throw toTransportError(error);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new MarketDataError('Não foi possível consultar a fonte de dados.', 502);
}

/** GET de JSON. */
export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const request = buildRequest(url, options);
  const response = await requestWithRetry(request.url, request.init);

  try {
    return (await response.json()) as T;
  } catch {
    throw new MarketDataError('A fonte de dados devolveu uma resposta inválida.', 502);
  }
}

/** GET de texto (RSS/XML) com o mesmo timeout e repetição do JSON. */
export async function fetchText(url: string, options: FetchJsonOptions = {}): Promise<string> {
  const request = buildRequest(url, options);
  const response = await requestWithRetry(request.url, request.init);

  try {
    return await response.text();
  } catch {
    throw new MarketDataError('A fonte de dados devolveu uma resposta inválida.', 502);
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
