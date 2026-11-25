import { fetchText } from '@/lib/market/http';

import type { NewsFeed } from './feeds';
import { cleanText, truncateText } from './text';
import type { NewsItem, NewsScope } from './types';

/**
 * Leitor de RSS 2.0 sem dependência externa.
 *
 * Os feeds que usamos são RSS 2.0 com `<item>` e campos simples — um parser
 * completo de XML (com namespaces, entidades e CDATA) seria mais código do que
 * o problema exige, e traria uma dependência nova só para o painel.
 *
 * O que o parser garante:
 *  - título/link/descrição passam por `cleanText` (sem tags, sem entidades);
 *  - item sem título ou sem link é descartado (não vira linha quebrada na tela);
 *  - data ilegível vira `null` em vez de `Invalid Date`.
 */

const ITEM_PATTERN = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;

/** Item sem descrição útil ainda aparece: só o resumo é opcional. */
const MAX_SUMMARY_LENGTH = 160;

const FEED_REQUEST_HEADERS: Record<string, string> = {
  accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

function extractTag(block: string, tag: string): string | null {
  const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = pattern.exec(block);

  return match?.[1] ?? null;
}

function parseDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value.trim());

  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

/** Google News informa o veículo original em `<source>`; vale mais que o rótulo do feed. */
function resolveSource(block: string, feed: NewsFeed): string {
  const tagged = cleanText(extractTag(block, 'source'));

  return tagged.length > 0 ? tagged : feed.source;
}

function toItem(block: string, feed: NewsFeed, scope: NewsScope): NewsItem | null {
  const title = cleanText(extractTag(block, 'title'));
  const url = cleanText(extractTag(block, 'link'));

  if (title.length === 0 || !/^https?:\/\//i.test(url)) {
    return null;
  }

  const rawSummary = cleanText(extractTag(block, 'description'));
  const summary = rawSummary.length > 0 ? truncateText(rawSummary, MAX_SUMMARY_LENGTH) : null;

  return {
    id: url,
    title,
    url,
    source: resolveSource(block, feed),
    publishedAt: parseDate(cleanText(extractTag(block, 'pubDate')) || null),
    scope,
    summary
  };
}

/** Converte o XML de um feed em itens já normalizados. */
export function parseRssFeed(xml: string, feed: NewsFeed, scope: NewsScope): NewsItem[] {
  const items: NewsItem[] = [];
  const seen = new Set<string>();

  for (const match of xml.matchAll(ITEM_PATTERN)) {
    const item = toItem(match[1] ?? '', feed, scope);

    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      items.push(item);
    }
  }

  return items;
}

/** Baixa e interpreta um feed. Erro de rede é do chamador — ele decide o fallback. */
export async function fetchFeed(
  feed: NewsFeed,
  scope: NewsScope,
  options: { noStore?: boolean } = {}
): Promise<NewsItem[]> {
  const xml = await fetchText(feed.url, {
    revalidateSeconds: 300,
    noStore: options.noStore,
    headers: FEED_REQUEST_HEADERS
  });

  return parseRssFeed(xml, feed, scope);
}
