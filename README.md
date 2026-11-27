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
| `/painel` | Indicadores do dia, resumo da carteira, notícias por recorte e juros |
| `/mercado` | Cotação, gráfico histórico e cards de favoritos; B3 (Brapi/Yahoo) e cripto (CoinGecko) |
| `/carteira` | Posições, preço médio, resultado |
| `/alertas` | Alertas de preço com disparo por e-mail |
| `/configuracoes` | Moeda das criptomoedas (real ou dólar) e estado do câmbio/refresh |

### Moeda das criptomoedas (Configurações)

A tela `/configuracoes` define se as **criptomoedas** aparecem em **real** ou **dólar**.
A escolha fica no cookie `bm-display-currency` (1 ano, leitura no servidor). O toggle
`Real | Dólar` do Mercado grava a mesma preferência, então a decisão tomada na cotação vira
o padrão do app.

**Ações e FIIs ficam sempre em reais.** A B3 negocia em reais, o custo é digitado em reais e
um preço convertido por câmbio do dia seria um número inventado. A preferência não os afeta
em nenhum cenário — nem preço, nem valor de mercado, nem resultado.

| Situação | Como o valor é obtido |
| --- | --- |
| Cripto em dólar | Preço nativo da CoinGecko (`vs_currency=usd`), sem conversão local |
| Cripto em real | CoinGecko em `vs_currency=brl` |
| Ação/FII | Sempre o preço original da B3 (Brapi/Yahoo), em reais |

`web/lib/money.ts` concentra a regra: `displayCurrencyFor(assetType, preference)` devolve a
preferência **só para `crypto`** e `BRL` para o resto; `quoteMapForDisplay` aplica isso a um
mapa de cotações. Na carteira e no painel, `summarizePositions` devolve **dois grupos
independentes** (`stocks` em BRL, `crypto` na moeda escolhida) — somar dólar com real num
único número enganaria o usuário. A barra de alocação e o ranking de posições comparam os
dois grupos convertendo para reais (`marketValueBrl`), usando a PTAX do dia
(`web/lib/market/fx.ts`: BCB SGS 10813, Yahoo `BRL=X` como reserva).

`portfolio.avg_price` é gravado **em reais** para os dois tipos de ativo; na cripto a
conversão acontece na leitura (`buildPositions`), então trocar de moeda nunca reescreve o
custo cadastrado. O formulário de edição usa `avgPriceBase` justamente para reenviar o valor
original. Se nenhuma fonte de câmbio responder, a taxa vem `null` e o valor fica na moeda de
origem — nada é inventado.

Indicadores de proventos (dividend yield, valores pagos e periodicidade) são sempre em reais,
porque o provento da B3 é pago em reais independentemente da moeda de exibição das criptos.

`getQuoteMapPartial` (`web/lib/market/index.ts`) busca B3 e cripto em chamadas separadas: um
429 da CoinGecko não pode zerar os preços da bolsa, e vice-versa.

### Atualização automática (5 minutos)

Painel, Mercado e Carteira chamam `router.refresh()` a cada 5 minutos
(`web/lib/market/refresh.ts` → `REFRESH_INTERVAL_MINUTES`), revalidando os Server Components
sem recarregar a página. O intervalo também aparece em Configurações e no botão **Atualizar**
do topo de cada tela.

### Proventos (dividendos dos ativos da B3)

`web/lib/market/fundamentals.ts` calcula, a partir do histórico de dividendos do Yahoo
(`chart?events=div`, sem chave):

- **Dividend yield 12m** sobre o preço atual;
- **Total pago nos últimos 12 meses** por cota e **média por pagamento**;
- **Periodicidade** inferida do intervalo mediano: mensal (≤45 d), trimestral (≤110 d),
  semestral (≤200 d), anual (≤400 d) ou irregular;
- **Últimos proventos** (data e valor) e estimativa do próximo pelo intervalo médio;
- **Projeção de renda** quando o ativo está na carteira (por ano e por mês).

`computeDividendMetrics` é pura (eventos + preço → métricas), o que permite testar a
periodicidade sem rede.

### Favoritos

Cada usuário pode marcar até **12 ativos** no mercado; eles aparecem como cards no topo da
tela, com preço e variação do dia, e o card abre a cotação completa. Favoritar não é comprar:
a lista é independente da carteira, que continua sendo a única fonte de posição e preço médio.

A estrela do mercado e a estrela do card usam a mesma ação de servidor
(`web/app/actions/favorites.ts`): ela alterna entre inserir e remover, resolve o `crypto_id`
na CoinGecko antes de gravar e revalida `/mercado`. Falhas são silenciosas de propósito — um
favorito que não grava não pode derrubar a página de cotação.

O estado vive na tabela `public.favorites` (`web/supabase/migrations/0002_favorites.sql`),
com RLS por `user_id` e unicidade em `(user_id, ticker, asset_type)`. O app desktop lê e
escreve a mesma tabela, então a lista é a mesma nas duas aplicações.

### Indicadores, juros e notícias

O topo do painel mostra quatro indicadores (**dólar, euro, ouro e Ibovespa**), os juros do
Banco Central (**Selic** e **IPCA**) e as manchetes do dia em três recortes: **Brasil**,
**Economia** e **Mundo**.

| Bloco | Fonte |
| --- | --- |
| Câmbio e ouro | AwesomeAPI (`USD-BRL`, `EUR-BRL`, `XAU-BRL`), sem chave |
| Ibovespa | Yahoo Finance (`^BVSP`) |
| Reserva do câmbio | Yahoo (`USDBRL=X`, `EURBRL=X`, `GC=F`) |
| Selic e IPCA | BCB SGS (`api.bcb.gov.br/dados/serie/bcdata.sgs`) |
| Notícias | RSS de G1, CNN Brasil, InfoMoney e Google News |

O ouro é exibido **por grama** (a onça-troy tem 31,1034768 g) e o preço da onça em dólar é
derivado da cotação do dólar do mesmo instante. Cada bloco falha sozinho: se a AwesomeAPI
cair, o câmbio vem do Yahoo; se uma fonte de notícias cair, as outras continuam. Quando
nada responde, o bloco simplesmente não aparece — um card a menos é melhor que uma tela de
erro.

Os endpoints `/api/macro` e `/api/news` (ambos autenticados) expõem os mesmos dados para
uso fora dos Server Components, com cache de 2 minutos.

### Banco de dados (migrações)

As migrações ficam em `web/supabase/migrations/` e são aplicadas **manualmente** no
**SQL Editor** do painel do Supabase (não há CLI nem service key no fluxo do dia a dia):

| Arquivo | O que cria |
| --- | --- |
| `0001_init.sql` | Tipos `asset_type`/`alert_direction`, tabelas `portfolio` e `alerts`, RLS |
| `0002_favorites.sql` | Tabela `favorites` (cards de ativos favoritados), RLS e unicidade |

Rode `0002_favorites.sql` depois do `0001_init.sql`. Sem ela a tela de mercado continua
funcionando, mas mostra um aviso no lugar da seção de favoritos e a estrela não grava.
Os dois arquivos são idempotentes: rodar de novo não duplica nada.

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

### API para o app desktop (`/api/app/*`)

O desktop **hospedado** não fala com Brapi, CoinGecko nem BCB: fala com este servidor. As
rotas em `web/app/api/app/` são autenticadas pelo **bearer token do próprio usuário**
(`web/lib/auth/bearer.ts`) e devolvem o mesmo payload dos Server Components, convertido
para JSON:

| Rota | Devolve |
| --- | --- |
| `POST /api/app/quotes` | cotações em lote para `{ assets: [...], currency }` |
| `GET /api/app/history` | série histórica de um ativo |
| `GET /api/app/search` | busca de ativos (B3 + cripto) |
| `GET /api/app/macro` | indicadores e juros do painel |
| `GET /api/app/news` | manchetes por recorte |
| `POST /api/app/alerts/check` | roda a verificação de alertas **do usuário** e envia os e-mails |

`POST /api/app/alerts/check` existe por um motivo específico: é o que permite distribuir o
executável **sem credencial de e-mail**. O servidor usa a mesma rotina do cron
(`web/lib/alerts/run.ts`), então a trava atômica de `last_notified_at` vale para os dois
caminhos e nenhum alerta gera dois e-mails.

`web/proxy.ts` deixa passar as rotas `/api/app/*` sem consultar a sessão do cookie — o
token do header é que identifica o usuário, e uma ida ao GoTrue por requisição só
adicionaria latência.

## App desktop (`desktop/`)

WPF em .NET 8, MVVM com CommunityToolkit, gráficos com LiveCharts.

```bash
cd desktop
dotnet build BolsaMonitor.slnx
dotnet run --project src/BolsaMonitor.Desktop -- --demo   # dados de demonstração
dotnet test src/BolsaMonitor.Core.Tests
```

O modo demonstração não usa Supabase nem rede. O padrão da release é o **modo
hospedado**: `appsettings.defaults.json` (versionado, só dados públicos) já aponta para
`https://bolsa-monitor.vercel.app`, e o app consome `/api/app/*` com o token do próprio
usuário. Nesse modo a release **não carrega chave de provider nenhuma** — nem Brapi, nem
CoinGecko, nem Resend/SMTP; quem tem as credenciais é o servidor.

Para rodar contra os provedores com chaves próprias (modo **direto**), deixe `ApiBaseUrl`
vazio e copie `src/BolsaMonitor.Desktop/appsettings.example.json` para `appsettings.json`.
Detalhes em [`desktop/README.md`](desktop/README.md).

A cotação do dólar aparece no rodapé de todas as telas do desktop, inclusive no login.

A tela **Mercado** também alterna a moeda de criptomoedas entre **Real** e **Dólar**;
ativos da B3 permanecem em reais porque essa é a única cotação real negociada.

A mesma tela traz a faixa de **Favoritos** em cards: a estrela ao lado do ticker (ou no
canto do card) alterna o ativo na lista. No modo `--demo` os favoritos vêm de
`DemoFavoriteRepository`, em memória; fora dele vêm da tabela `favorites`.

O **Painel** repete os blocos da versão web: faixa de indicadores (dólar, euro, ouro por
grama e Ibovespa), notícias com abas por recorte e os juros do Banco Central. As regras são
as mesmas (`MacroClient` e `NewsService` em `BolsaMonitor.Core`), inclusive a falha
independente por fonte; no modo `--demo` entram `DemoMacroService` e `DemoNewsService`, que
não tocam a rede. As manchetes abrem no navegador padrão.

## Testes

- `web`: `npx tsc --noEmit` e `npm run build`.
- `desktop`: `dotnet test src/BolsaMonitor.Core.Tests` — 88 testes: formatação, carteira,
  alertas, regras de alerta e de favoritos, parsing de RSS e o contrato JSON de
  `/api/app/*` (`ApiJsonTests`).
