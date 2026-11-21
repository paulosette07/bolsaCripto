'use client';

import clsx from 'clsx';
import { Loader2, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { AssetSearchResult } from '@/lib/market/types';

interface AssetSearchProps {
  onSelect: (result: AssetSearchResult) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  /** Limpa o campo após selecionar (usado em formulários). */
  clearOnSelect?: boolean;
}

const DEBOUNCE_MS = 320;
const MIN_QUERY_LENGTH = 2;

export function AssetSearch({
  onSelect,
  placeholder = 'Busque por PETR4, HGLG11, BTC…',
  autoFocus = false,
  className,
  clearOnSelect = false
}: AssetSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AssetSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < MIN_QUERY_LENGTH) {
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setIsLoading(true);

      fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
        headers: { accept: 'application/json' }
      })
        .then(async (response) => {
          if (!response.ok) {
            return { results: [] as AssetSearchResult[] };
          }

          return (await response.json()) as { results?: AssetSearchResult[] };
        })
        .then((payload) => {
          setResults(payload.results ?? []);
          setIsOpen(true);
          setActiveIndex(-1);
        })
        .catch(() => {
          // AbortError quando o usuário digita de novo: silencioso por design.
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsLoading(false);
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // Fecha ao clicar fora.
  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);

    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  function handleSelect(result: AssetSearchResult) {
    onSelect(result);
    setIsOpen(false);
    setResults([]);

    if (clearOnSelect) {
      setQuery('');
    } else {
      setQuery(result.ticker);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || results.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? results.length - 1 : current - 1));
    } else if (event.key === 'Enter') {
      const selected = results[activeIndex >= 0 ? activeIndex : 0];

      if (selected) {
        event.preventDefault();
        handleSelect(selected);
      }
    } else if (event.key === 'Escape') {
      setIsOpen(false);
    }
  }

  return (
    <div ref={containerRef} className={clsx('relative', className)}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
          aria-hidden="true"
        />

        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            if (results.length > 0) {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls="asset-search-results"
          aria-autocomplete="list"
          className="field pl-9 pr-9 uppercase placeholder:normal-case"
        />

        {isLoading ? (
          <Loader2
            className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-ink-faint"
            aria-label="Buscando"
          />
        ) : query.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setResults([]);
              setIsOpen(false);
            }}
            aria-label="Limpar busca"
            className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-ink-faint transition-colors hover:text-ink"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {isOpen && results.length > 0 ? (
        <ul
          id="asset-search-results"
          role="listbox"
          className="absolute z-30 mt-1.5 max-h-72 w-full overflow-y-auto rounded-[8px] border border-line bg-surface p-1 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.8)]"
        >
          {results.map((result, index) => (
            <li key={`${result.assetType}-${result.cryptoId ?? result.ticker}-${index}`}>
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => handleSelect(result)}
                className={clsx(
                  'flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-left transition-colors',
                  index === activeIndex ? 'bg-surface-3' : 'hover:bg-surface-2'
                )}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[10px] font-semibold text-ink-muted">
                  {result.ticker.slice(0, 2)}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-ink">{result.ticker}</span>
                    <span className="shrink-0 rounded-full border border-line px-1.5 py-px text-[10px] uppercase tracking-wide text-ink-faint">
                      {result.assetType === 'crypto' ? 'Cripto' : 'B3'}
                    </span>
                  </span>
                  <span className="block truncate text-[11px] text-ink-muted">{result.name}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {isOpen && !isLoading && results.length === 0 && query.trim().length >= MIN_QUERY_LENGTH ? (
        <div className="absolute z-30 mt-1.5 w-full rounded-[8px] border border-line bg-surface px-3 py-2.5 text-xs text-ink-muted shadow-[0_12px_32px_-12px_rgba(0,0,0,0.8)]">
          Nenhum ativo encontrado. Tente o código exato (ex: PETR4) ou o nome da cripto.
        </div>
      ) : null}
    </div>
  );
}
