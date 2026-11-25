/**
 * Contrato das notícias do painel.
 *
 * Três recortes, porque é assim que o investidor lê o dia: o que acontece no
 * Brasil, o que mexe com o bolso (economia/mercado) e o que vem de fora.
 */
export type NewsScope = 'brasil' | 'economia' | 'mundo';

export const NEWS_SCOPES: readonly NewsScope[] = ['brasil', 'economia', 'mundo'];

export const NEWS_SCOPE_LABELS: Record<NewsScope, string> = {
  brasil: 'Brasil',
  economia: 'Economia',
  mundo: 'Mundo'
};

export const NEWS_SCOPE_DESCRIPTIONS: Record<NewsScope, string> = {
  brasil: 'Manchetes do país',
  economia: 'Mercado e bolso',
  mundo: 'O que vem de fora'
};

export interface NewsItem {
  /** Estável entre renders: o próprio link da matéria. */
  id: string;
  title: string;
  url: string;
  /** Veículo de origem, já normalizado ("G1", "InfoMoney"…). */
  source: string;
  /** ISO 8601. `null` quando o feed não informa a data. */
  publishedAt: string | null;
  scope: NewsScope;
  /** Resumo curto em texto puro. `null` quando o feed não traz descrição útil. */
  summary: string | null;
}

export function isNewsScope(value: unknown): value is NewsScope {
  return typeof value === 'string' && (NEWS_SCOPES as readonly string[]).includes(value);
}

/** Notícias agrupadas pelos três recortes — o formato que a tela consome. */
export type NewsBoard = Record<NewsScope, NewsItem[]>;
