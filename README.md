# Bolsa Monitor

Monitor de cotações da B3 e de criptomoedas, com histórico, carteira e alertas por e-mail.
O repositório tem duas aplicações que compartilham o mesmo domínio e banco Supabase.

```
bolsa/
├── web/      Next.js 16 (App Router) + Supabase — versão publicada na Vercel
└── desktop/  WPF (.NET 8) + LiveCharts — aplicativo Windows
```

## Versão web (`web/`)

Next.js 16 com App Router, React Server Components, Tailwind e Supabase (auth + Postgres).

| Rota | Descrição |
| --- | --- |
| `/painel` | Resumo da carteira, melhores e piores variações |
| `/mercado` | Cotação e gráfico histórico; B3 (Brapi) e cripto (CoinGecko) |
| `/carteira` | Posições, preço médio, resultado |
| `/alertas` | Alertas de preço com disparo por e-mail |

No mercado, ativos de criptomoeda podem ser cotados em **real ou dólar**
(`/mercado?ticker=BTC&type=crypto&cryptoId=bitcoin&currency=USD`). Os preços em dólar vêm
diretamente da CoinGecko (`vs_currency=usd`), não de conversão local; ativos da B3 são sempre em reais.

### Rodando localmente

```bash
cd web
npm install
cp .env.local.example .env.local   # preencha as chaves
npm run dev
```

Variáveis obrigatórias (`web/lib/env.ts`):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL
SUPABASE_SERVICE_ROLE_KEY     # só no servidor
CRON_SECRET                   # header do cron de alertas
BRAPI_TOKEN                   # opcional
COINGECKO_API_KEY             # opcional
EMAIL_PROVIDER / RESEND_* / SMTP_*
```

Build de produção: `npm run build`. Deploy na Vercel com *Root Directory* = `web`.

O cron de alertas roda em `/api/alerts/check` (protegido por `Authorization: Bearer $CRON_SECRET`),
agendado em `web/vercel.json` e também por GitHub Actions.

## App desktop (`desktop/`)

WPF em .NET 8, MVVM com CommunityToolkit, gráficos com LiveCharts.

```bash
cd desktop
dotnet build BolsaMonitor.slnx
dotnet run --project src/BolsaMonitor.Desktop -- --demo   # dados de demonstração
dotnet test src/BolsaMonitor.Core.Tests
```

No modo demonstração não é necessário Supabase. Sem `--demo`, copie
`src/BolsaMonitor.Desktop/appsettings.example.json` para `appsettings.json` e preencha as chaves.

A tela **Mercado** também alterna a moeda de criptomoedas entre **Real** e **Dólar**;
ativos da B3 permanecem em reais porque essa é a única cotação real negociada.

## Testes

- `web`: `npx tsc --noEmit` e `npm run build`.
- `desktop`: `dotnet test src/BolsaMonitor.Core.Tests` (formatação, carteira, alertas e avaliação de regras).
