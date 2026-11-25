'use client';

import clsx from 'clsx';
import { useState } from 'react';

import { NewsList } from '@/components/news/news-list';
import { Card, CardHeader } from '@/components/ui/card';
import type { NewsBoard as NewsBoardData, NewsScope } from '@/lib/news/types';
import { NEWS_SCOPES, NEWS_SCOPE_LABELS } from '@/lib/news/types';

/**
 * Bloco de notícias do painel com abas Brasil / Economia / Mundo.
 *
 * Os três recortes chegam prontos do servidor (uma requisição só), então trocar
 * de aba é troca de estado local — nada de fetch no cliente.
 */
export function NewsBoard({ board }: { board: NewsBoardData }) {
  const [scope, setScope] = useState<NewsScope>('brasil');
  const items = board[scope];

  return (
    <Card>
      <CardHeader
        title="Notícias"
        description="O que mexe com o mercado hoje"
        action={
          <div
            role="tablist"
            aria-label="Recortes de notícias"
            className="flex items-center gap-1 rounded-[8px] border border-line bg-canvas p-0.5"
          >
            {NEWS_SCOPES.map((option) => {
              const isActive = option === scope;

              return (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setScope(option)}
                  className={clsx(
                    'rounded-[6px] px-2.5 py-1 text-[11px] font-medium transition-colors',
                    isActive
                      ? 'bg-surface-3 text-ink'
                      : 'text-ink-muted hover:text-ink'
                  )}
                >
                  {NEWS_SCOPE_LABELS[option]}
                </button>
              );
            })}
          </div>
        }
      />

      <NewsList items={items} />

      <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2.5 sm:px-5">
        <p className="text-[11px] text-ink-faint">Fontes: G1, CNN Brasil, InfoMoney</p>
        <p className="text-[11px] text-ink-faint">atualizado a cada 5 min</p>
      </div>
    </Card>
  );
}
