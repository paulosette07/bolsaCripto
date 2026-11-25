import type { NewsScope } from './types';

/**
 * Feeds RSS usados no painel.
 *
 * Só entram fontes verificadas: respondem sem chave, em RSS 2.0 com `<item>`
 * e datas em RFC 822. Isso permite um leitor simples (`rss.ts`) sem dependência
 * de parser XML e sem surpresa em produção.
 *
 * Ordem importa: a primeira fonte de cada recorte é a âncora. O restante
 * complementa e cobre a falha da anterior.
 */
export interface NewsFeed {
  /** Nome exibido no item, curto e reconhecível. */
  source: string;
  url: string;
}

export const NEWS_FEEDS: Record<NewsScope, readonly NewsFeed[]> = {
  brasil: [
    { source: 'G1', url: 'https://g1.globo.com/rss/g1/' },
    { source: 'CNN Brasil', url: 'https://www.cnnbrasil.com.br/feed/' }
  ],
  economia: [
    { source: 'InfoMoney', url: 'https://www.infomoney.com.br/feed/' },
    { source: 'G1 Economia', url: 'https://g1.globo.com/rss/g1/economia/' }
  ],
  mundo: [
    { source: 'G1 Mundo', url: 'https://g1.globo.com/rss/g1/mundo/' },
    {
      source: 'Google News',
      url: 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=pt-BR&gl=BR&ceid=BR:pt-419'
    }
  ]
};
