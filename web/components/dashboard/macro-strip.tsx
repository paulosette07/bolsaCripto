import { MacroCard } from '@/components/dashboard/macro-card';
import type { MacroQuote } from '@/lib/market/macro';

/**
 * Faixa de indicadores macro do topo do painel.
 *
 * Sem dados (todas as fontes fora), a faixa some em vez de mostrar quatro
 * cards vazios: o resto do painel continua útil sem ela.
 */
export function MacroStrip({ quotes }: { quotes: readonly MacroQuote[] }) {
  if (quotes.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Indicadores do mercado"
      className="grid grid-cols-2 gap-3 xl:grid-cols-4"
    >
      {quotes.map((quote) => (
        <MacroCard key={quote.id} quote={quote} />
      ))}
    </section>
  );
}
