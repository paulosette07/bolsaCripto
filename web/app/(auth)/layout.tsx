import type { ReactNode } from 'react';
import { BellRing, LineChart, Wallet } from 'lucide-react';

import { BrandLockup } from '@/components/brand/logo';

const HIGHLIGHTS = [
  {
    icon: LineChart,
    title: 'Cotações em tempo real',
    description: 'Ações, FIIs e cripto com gráfico de histórico e variação do dia.'
  },
  {
    icon: Wallet,
    title: 'Carteira consolidada',
    description: 'Quantidade exata de cada ativo, saldo por posição e patrimônio total.'
  },
  {
    icon: BellRing,
    title: 'Alertas por e-mail',
    description: 'Defina preço-alvo e receba aviso automático quando o mercado atingir.'
  }
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Painel de marca — escondido no mobile para o formulário ganhar espaço */}
      <aside className="relative hidden overflow-hidden border-r border-line bg-surface px-12 py-14 lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 18% 22%, rgba(16,185,129,0.14), transparent 45%), radial-gradient(circle at 82% 78%, rgba(16,185,129,0.08), transparent 42%)'
          }}
        />

        <div className="relative">
          <BrandLockup />
        </div>

        <div className="relative max-w-md">
          <h1 className="text-[2rem] font-semibold leading-[1.15] tracking-tight text-ink">
            Seu mercado inteiro,
            <br />
            <span className="text-up">em uma tela só.</span>
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-ink-muted">
            Monitore a B3 e as criptomoedas que você acompanha, controle sua carteira e não perca
            mais um ponto de entrada.
          </p>

          <ul className="mt-10 space-y-6">
            {HIGHLIGHTS.map(({ icon: Icon, title, description }) => (
              <li key={title} className="flex gap-3.5">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[8px] border border-line bg-canvas text-up">
                  <Icon className="size-4" aria-hidden="true" strokeWidth={2} />
                </span>
                <div>
                  <p className="text-sm font-medium text-ink">{title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] text-ink-faint">
          Dados de mercado por Brapi e CoinGecko. Este app não faz recomendação de investimento.
        </p>
      </aside>

      <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-12 sm:px-8">
        <div className="mb-8 lg:hidden">
          <BrandLockup />
        </div>
        <div className="w-full max-w-[380px]">{children}</div>
      </main>
    </div>
  );
}
