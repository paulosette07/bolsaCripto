import { NEWS_FEEDS } from './feeds';
import { fetchFeed } from './rss';
import type { NewsBoard, NewsItem, NewsScope } from './types';
import { NEWS_SCOPES } from './types';

/**
 * Agregação das notícias do painel.
 *
 * Regras:
 *  - cada feed falha sozinho (um erro de rede não zera o bloco);
 *  - o resultado é ordenado do mais recente para o mais antigo;
 *  - manchetes repetidas entre veículos são descartadas pelo começo do título,
 *    que é o que costuma ser idêntico quando o mesmo fato é republicado.
 */

export const DEFAULT_NEWS_LIMIT = 6;

/** Comparação de manchete: ignora caixa, acento e pontuação. */
function headlineFingerprint(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

function sortByRecency(items: NewsItem[]): NewsItem[] {
  return items.slice().sort((a, b) => {
    const left = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const right = b.publishedAt ? Date.parse(b.publishedAt) : 0;

    return right - left;
  });
}

function dedupe(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const result: NewsItem[] = [];

  for (const item of items) {
    const key = headlineFingerprint(item.title);

    if (key.length === 0 || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

/**
 * Notícias de um recorte. Os feeds do recorte rodam em paralelo; o que falhar
 * é ignorado. Lista vazia significa "nada disponível agora", não erro.
 */
export async function getNews(
  scope: NewsScope,
  limit: number = DEFAULT_NEWS_LIMIT,
  options: { noStore?: boolean } = {}
): Promise<NewsItem[]> {
  const feeds = NEWS_FEEDS[scope];

  const settled = await Promise.allSettled(
    feeds.map((feed) => fetchFeed(feed, scope, options))
  );

  const collected: NewsItem[] = [];

  for (const entry of settled) {
    if (entry.status === 'fulfilled') {
      collected.push(...entry.value);
    }
  }

  return dedupe(sortByRecency(collected)).slice(0, limit);
}

/** Os três recortes de uma vez, para o painel renderizar tudo no servidor. */
export async function getNewsBoard(
  limit: number = DEFAULT_NEWS_LIMIT,
  options: { noStore?: boolean } = {}
): Promise<NewsBoard> {
  const results = await Promise.all(NEWS_SCOPES.map((scope) => getNews(scope, limit, options)));

  return NEWS_SCOPES.reduce<NewsBoard>(
    (board, scope, index) => {
      board[scope] = results[index] ?? [];

      return board;
    },
    { brasil: [], economia: [], mundo: [] }
  );
}

export type { NewsBoard, NewsItem, NewsScope } from './types';
export { NEWS_SCOPES, NEWS_SCOPE_DESCRIPTIONS, NEWS_SCOPE_LABELS, isNewsScope } from './types';
