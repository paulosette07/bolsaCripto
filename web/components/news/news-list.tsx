import { ArrowUpRight } from 'lucide-react';

import { formatNewsTime } from '@/lib/format';
import type { NewsItem } from '@/lib/news/types';

/**
 * Lista de manchetes.
 *
 * Cada item é um link que abre a matéria em outra aba — o painel não é lugar
 * de leitura longa, e perder a carteira aberta ao clicar seria ruim.
 */
export function NewsList({ items }: { items: readonly NewsItem[] }) {
  if (items.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-ink-muted sm:px-5">
        Nenhuma notícia disponível agora.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-line">
      {items.map((item) => (
        <li key={item.id}>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2/50 sm:px-5"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug text-ink group-hover:text-up">
                {item.title}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-ink-faint">
                <span className="font-medium text-ink-muted">{item.source}</span>
                <span aria-hidden="true">·</span>
                <span className="numeric">{formatNewsTime(item.publishedAt)}</span>
              </p>
            </div>

            <ArrowUpRight
              className="mt-0.5 size-3.5 shrink-0 text-ink-faint transition-colors group-hover:text-up"
              aria-hidden="true"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
