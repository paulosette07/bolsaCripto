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
| `/mercado` | Cotação e gráfico histórico; B3 (Brapi/Yahoo) e cripto (CoinGecko) |
| `/carteira` | Posições, preço médio, resultado |
| `/alertas` | Alertas de preço com disparo por e-mail |

No mercado, ativos de criptomoeda podem ser cotados em **real ou dólar**
(`/mercado?ticker=BTC&type=crypto&cryptoId=bitcoin&currency=USD`). Os preços em dólar vêm
diretamente da CoinGecko (`vs_currency=usd`), não de conversão local; ativos da B3 são sempre em reais.

### Fonte de dados da B3

A Brapi passou a exigir token em `/quote/{ticker}` (sem `BRAPI_TOKEN` a resposta é
**HTTP 401**, que é o erro que aparece ao abrir um ativo no mercado). Para a tela não
depender de uma credencial, `web/lib/market/stocks.ts` escolhe a fonte:

| `BRAPI_TOKEN` | Provider |
| --- | --- |
| definido | Brapi; se ela falhar, Yahoo Finance |
| vazio | Yahoo Finance direto (sem chave) |

A busca de ativos roda nas duas fontes em paralelo e junta os resultados. Para usar a
Brapi como fonte principal, crie um token gratuito em `brapi.dev/dashboard` e defina
`BRAPI_TOKEN` na Vercel.

### Rodando localmente

```bash
cd web
npm install
cp .env.local.example .env.local   # preencha as chaves
npm run dev
```

Variáveis (`web/lib/env.ts`):

```
NEXT_PUBLIC_SUPABASE_URL          # obrigatória
NEXT_PUBLIC_SUPABASE_ANON_KEY     # obrigatória
NEXT_PUBLIC_SITE_URL              # opcional: fallback do domínio dos e-mails
SUPABASE_SERVICE_ROLE_KEY         # só no servidor
CRON_SECRET                       # header do cron de alertas
BRAPI_TOKEN                       # opcional
COINGECKO_API_KEY                 # opcional
EMAIL_PROVIDER / RESEND_* / SMTP_*
```

`NEXT_PUBLIC_SITE_URL` não é mais necessária: os links de confirmação usam o
domínio do request. Só preencha se quiser forçar outro domínio.

Build de produção: `npm run build`. Deploy na Vercel com *Root Directory* = `web`.

### Confirmação de e-mail (link apontando para localhost)

Quando o e-mail chega com `http://localhost:3000/?code=...`, **o problema é a
configuração do projeto Supabase**, não o código: o Supabase descarta o
`emailRedirectTo` enviado pelo app se a URL não estiver na lista de *Redirect
URLs* e cai no **Site URL** do painel.

O app já resolve o domínio pelo próprio request (`web/lib/config/site-url.ts`),
então basta autorizar os domínios em **Authentication → URL Configuration**:

- **Site URL**: `https://bolsa-monitor.vercel.app` (domínio de produção — nunca localhost).
- **Redirect URLs** (uma por linha):

```
https://bolsa-monitor.vercel.app/auth/callback
https://bolsa-monitor.vercel.app/auth/confirm
https://bolsa-monitor.vercel.app/**
https://*.vercel.app/**          # previews da Vercel
http://localhost:3000/**         # desenvolvimento
```

Sem o domínio correto no Site URL, todo link de confirmação gerado continua indo
para localhost, independentemente do que o app envie.

Os dois destinos internos são equivalentes:

| Rota | Consome |
| --- | --- |
| `/auth/callback?code=...` | template padrão do Supabase (PKCE) |
| `/auth/confirm?token_hash=...&type=email` | template customizado |

Para usar o template customizado, edite **Authentication → Email Templates →
Confirm signup** com:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/painel
```

Como rede de segurança, `web/proxy.ts` reencaminha qualquer `?code=` ou
`?token_hash=` que caia em outra rota (a home, por exemplo) para a rota interna
correta — o usuário não fica preso com a sessão pendente.

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
