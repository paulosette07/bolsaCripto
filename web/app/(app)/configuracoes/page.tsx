import type { Metadata } from 'next';
import { CircleDollarSign, RefreshCw } from 'lucide-react';

import { CurrencyPreference } from '@/components/settings/currency-preference';
import { Card, CardHeader } from '@/components/ui/card';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { getUsdBrlRate } from '@/lib/market/fx';
import { getDisplayCurrency } from '@/lib/preferences/display-currency';
import { REFRESH_INTERVAL_MINUTES } from '@/lib/market/refresh';

export const metadata: Metadata = {
  title: 'Configurações'
};

const FX_SOURCE_LABELS = {
  bcb: 'Banco Central (PTAX)',
  yahoo: 'Yahoo Finance',
  none: 'indisponível'
} as const;

export default async function SettingsPage() {
  const currency = await getDisplayCurrency();
  const fx = currency === 'USD' ? await getUsdBrlRate() : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Configurações</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Cripto em real ou dólar. Ações e FIIs ficam sempre em reais, como na B3.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader
            title="Moeda das criptomoedas"
            description="Em qual moeda exibir cripto no Mercado, no Painel e na Carteira"
            action={
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-faint">
                <CircleDollarSign className="size-3" aria-hidden="true" />
                {currency === 'USD' ? 'Dólar' : 'Real'}
              </span>
            }
          />

          <div className="p-4 sm:p-5">
            <CurrencyPreference current={currency} />
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Atualização automática"
              description={`Cotações recarregam a cada ${REFRESH_INTERVAL_MINUTES} minutos`}
            />

            <div className="space-y-3 p-4 sm:p-5">
              <div className="flex items-start gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] border border-line bg-canvas text-up">
                  <RefreshCw className="size-4" aria-hidden="true" strokeWidth={2} />
                </span>
                <p className="text-xs leading-relaxed text-ink-muted">
                  Painel, Mercado e Carteira se atualizam sozinhos a cada{' '}
                  {REFRESH_INTERVAL_MINUTES} minutos, sem recarregar a página inteira. O horário da
                  última atualização aparece no topo das cotações.
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Câmbio usado nas conversões"
              description={
                currency === 'USD'
                  ? 'Dólar comercial do dia'
                  : 'Necessário apenas quando a cripto está em dólar'
              }
            />

            <dl className="divide-y divide-line">
              <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <dt className="text-xs text-ink-muted">Moeda das criptos</dt>
                <dd className="numeric text-sm font-medium text-ink">
                  {currency === 'USD' ? 'Dólar (US$)' : 'Real (R$)'}
                </dd>
              </div>

              <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <dt className="text-xs text-ink-muted">USD/BRL</dt>
                <dd className="numeric text-sm font-medium text-ink">
                  {fx && fx.rate !== null ? formatCurrency(fx.rate, 'BRL') : '—'}
                </dd>
              </div>

              <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <dt className="text-xs text-ink-muted">Fonte</dt>
                <dd className="text-xs text-ink">{FX_SOURCE_LABELS[fx?.source ?? 'none']}</dd>
              </div>

              <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <dt className="text-xs text-ink-muted">Referência</dt>
                <dd className="numeric text-xs text-ink">
                  {fx?.referenceDate ? formatDateTime(`${fx.referenceDate}T12:00:00Z`) : '—'}
                </dd>
              </div>
            </dl>

            <p className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-ink-faint sm:px-5">
              A taxa serve para converter o custo da cripto e para comparar cripto com a bolsa na
              alocação. Ações e FIIs nunca passam por aqui. Sem taxa disponível, os valores continuam
              na moeda original — nunca inventamos um câmbio.
            </p>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Como as moedas funcionam"
          description="O que muda com a escolha e o que nunca muda"
        />

        <ul className="space-y-2.5 p-4 text-xs leading-relaxed text-ink-muted sm:p-5">
          <li>
            <span className="font-medium text-ink">Cripto:</span> cotada nativamente em dólar pela
            CoinGecko. Em real, o provedor converte; em dólar, o preço é o de origem. Esta é a única
            parte do app afetada pela escolha acima.
          </li>
          <li>
            <span className="font-medium text-ink">Ações e FIIs:</span> sempre e somente em reais —
            preço, valor de mercado, resultado e patrimônio. Nada é convertido, em nenhum cenário.
          </li>
          <li>
            <span className="font-medium text-ink">Preço médio:</span> gravado em reais. Na cripto a
            conversão acontece na leitura, então mudar a moeda não altera o que você cadastrou.
          </li>
          <li>
            <span className="font-medium text-ink">Proventos:</span> dividend yield, valores pagos e
            periodicidade são sempre em reais, porque o provento da B3 é pago em reais.
          </li>
          <li>
            <span className="font-medium text-ink">Patrimônio:</span> a carteira mostra B3 e cripto
            em cards separados, cada um na sua moeda. Só a barra de alocação compara os dois — e ela
            converte a cripto para reais usando a taxa acima.
          </li>
        </ul>

        <p className="border-t border-line px-4 py-3 text-[11px] text-ink-faint sm:px-5">
          {fx && fx.rate !== null
            ? `Com a taxa atual, US$ 100,00 ≈ ${formatCurrency(fx.rate * 100, 'BRL')}.`
            : 'Com a cripto em reais não há conversão de câmbio; escolha dólar para ver a taxa aplicada.'}
        </p>
      </Card>
    </div>
  );
}
