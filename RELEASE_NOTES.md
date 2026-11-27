# Versão 1.2.2 — trocar Real/Dólar em cripto não estoura mais a fonte

## 1. O erro HTTP 429 ao alternar a moeda

A moeda escolhida viajava dentro da URL da CoinGecko (`vs_currency=brl` / `vs_currency=usd`).
Cada clique em **R$ ↔ US$** criava uma chave de cache nova e disparava cotação **e** histórico
na API pública, que limita por IP — resultado: `Falha ao consultar a fonte de dados (HTTP 429)`
justamente na troca de moeda.

Agora a fonte é consultada **sempre na mesma moeda (BRL)** e o dólar é derivado do câmbio do
dia (BCB, com Yahoo como reserva). Alternar a moeda deixa de gerar requisição nova: acerta o
cache do servidor.

- Preço, variação e histórico passam pelo **mesmo fator de conversão** — antes eram duas
  conversões independentes da fonte, que podiam divergir.
- Se o câmbio não estiver disponível, a fonte é consultada direto na moeda final. Nunca se
  inventa uma taxa.
- Bônus: `POST /api/quotes` com `currency: 'USD'` e preferência em real deixava de converter
  (câmbio nulo); agora o valor já vem correto do provider.

## 2. Resiliência quando a fonte limita

- Falhas **429/503** são repetidas uma vez, respeitando `Retry-After` (com teto para não
  travar a tela).
- Se o limite persistir, a CoinGecko serve a **última resposta boa** (até 15 min) em vez de
  trocar a cotação por uma caixa de erro. O horário real de atualização continua no rodapé
  do ativo, então o dado não se disfarça de novo.
- A mensagem de 429 agora diz o que fazer: "A fonte de dados limitou as consultas agora
  (HTTP 429). Aguarde alguns segundos e tente novamente."

## 3. Desktop com o mesmo tratamento

O app Windows tinha o mesmo defeito e recebeu a mesma correção:

- `UsdBrlRateProvider` (novo): dólar comercial do **BCB (SGS 10813)**, com fallback na
  AwesomeAPI e cache de 30 min.
- `CoinGeckoClient`: consulta sempre em BRL e converte preço, variação e todos os pontos do
  histórico pelo câmbio; só cai para `vs_currency=usd` quando não há câmbio.
- `JsonHttpClient`: repetição em 429/503 e mensagens específicas.

## 4. Banco de dados

Nenhuma migração nesta versão — só código. O Supabase continua com `0001_init.sql` e
`0002_favorites.sql` já aplicados.

## 5. Verificação

- API real: BRL 343.368 → exibido 343.368 em reais; USD 59.778,55 → exibido igual em dólar
  (rácio 5,745 = câmbio), sem conversão dupla, gráfico na mesma moeda.
- Rajada de 6 criptos em dólar sem cache: nenhuma falha.
- Web: `tsc --noEmit`, `eslint .` e `next build` limpos.
- Desktop: build ok e **70/70 testes** passando.

---

# Versão 1.2.1 — a moeda vale só para cripto; B3 fica em reais

## 1. Real ou dólar agora é uma escolha **das criptomoedas**

A preferência de moeda deixou de ser global. **Ações e FIIs aparecem sempre em reais**, em
qualquer configuração: preço, valor de mercado, resultado e patrimônio. A B3 negocia em
reais, o custo é digitado em reais e converter por cima seria exibir um número que não
existe. A escolha em **Configurações** afeta apenas as criptomoedas.

| Onde | Comportamento |
| --- | --- |
| Mercado | Cripto alterna Real/Dólar; ação e FII mostram `real (BRL)` e o toggle não aparece |
| Favoritos | Cada card na moeda do próprio ativo: ação em `R$`, cripto na moeda escolhida |
| Carteira e Painel | Dois cards independentes — **Patrimônio B3** (R$) e **Cripto** (US$/R$) |

## 2. Carteira e painel: dois patrimônios, sem soma enganosa

`summarizePositions` devolve grupos separados (`stocks` em BRL, `crypto` na moeda escolhida)
em vez de um total único. Somar dólar com real num só número daria um valor sem significado.
Quando a comparação faz sentido — barra de alocação e ranking de posições — os dois grupos
são convertidos para reais (`marketValueBrl`) pela PTAX do dia.

## 3. Uma fonte fora do ar não apaga a outra

`getQuoteMapPartial` (`web/lib/market/index.ts`) busca B3 e cripto em chamadas separadas.
Antes, um erro da CoinGecko (rate limit) derrubava junto os preços da bolsa e a carteira
inteira aparecia sem cotação. Agora cada grupo entra no mapa com o que respondeu.

## 4. Textos de Configurações refeitos

A tela explica o que muda e o que nunca muda: cripto seguindo a preferência, B3 sempre em
reais, preço médio gravado em reais, proventos em reais e a barra de alocação como única
comparação entre os dois grupos. A taxa USD/BRL aparece com fonte e data de referência.

## 5. API

`POST /api/quotes` mantém `currency` no corpo, mas ele vale **só para cripto**: ações e FIIs
voltam sempre em reais, e o campo `currency` da resposta repete a preferência usada.

---

# Versão 1.2.0 — moeda preferida, atualização a cada 5 min e proventos

## 1. Moeda preferida em Configurações

Nova tela **Configurações** (`/configuracoes`, item no menu lateral) com a escolha
**Real (R$)** ou **Dólar (US$)** para criptomoedas. A preferência fica em cookie
(`bm-display-currency`, 1 ano) e vale para o app inteiro:

- **Mercado**: cripto abre na moeda escolhida; o toggle `Real | Dólar` do ativo grava a
  mesma preferência, então a escolha feita na cotação vira padrão do app.
- **Painel e Carteira**: patrimônio, custo e resultado da cripto aparecem na moeda
  escolhida. *(Na 1.2.1 a regra mudou: a preferência passou a valer só para cripto e a B3
  ficou definitivamente em reais.)*
- **Sem câmbio, sem conversão**: se BCB e Yahoo falharem, o valor continua na moeda
  original em vez de exibir um número inventado. A taxa usada fica visível em
  Configurações (valor, fonte e data).
- **Preço médio** segue gravado em reais; a conversão acontece na leitura, então trocar de
  moeda nunca altera o que foi cadastrado.

## 2. Atualização automática a cada 5 minutos

Painel, Mercado e Carteira recarregam as cotações sozinhos a cada **5 minutos** via
`router.refresh()` (revalida os Server Components sem recarregar a página nem perder o
range do gráfico). Há um botão **Atualizar** manual com o horário da última atualização,
e o timer reinicia quando a aba volta ao foco.

## 3. Proventos na área de mercado

Ativos da B3 agora têm a ficha **Proventos**, com dados em reais:

- **Dividend yield 12m** sobre o preço atual
- **Total pago nos últimos 12 meses** por cota
- **Periodicidade** inferida do histórico: mensal, trimestral, semestral, anual ou irregular
- **Média por pagamento** e número de pagamentos no ano
- **Últimos proventos** (data e valor) e estimativa do próximo
- **Projeção de renda** quando você já tem o ativo na carteira (valor por ano e por mês)

Fonte: histórico de dividendos do Yahoo Finance (`events=div`), sem necessidade de chave.

## 4. API

`POST /api/quotes` aceita `currency: 'BRL' | 'USD'` no corpo; sem ele usa a preferência
salva. A resposta devolve todas as cotações na mesma moeda, mais o campo `currency`.
`GET /api/quotes` informa a moeda ativa da sessão (diagnóstico).

---

Aplicativo desktop do Bolsa Monitor para Windows 10/11 de 64 bits.

**Download:** `BolsaMonitor-win-x64-1.1.0.zip` (104 MB) — extraia a pasta e execute `BolsaMonitor.exe`.

## Correção — favoritar mantém a moeda selecionada

- **Cripto favoritada continua em dólar**: com o seletor `Real | Dólar` em dólar, os cards de favoritos mostram o preço em `US$` em vez de cair para o real. A cotação da B3 segue em reais, como sempre.
- **A escolha da moeda sobrevive à navegação**: abrir uma ação, buscar outro ativo ou clicar em um favorito não devolve a tela para o real — a preferência volta quando você abre uma cripto de novo.
- Web e desktop se comportam igual. O pacote `.zip` desta release foi regerado com a correção.

## Novidades da versão 1.1.0 — Favoritos

- **Favoritos em cards no Mercado**: os ativos marcados com a estrela aparecem em uma faixa de cards no topo da tela Mercado, com preço e variação do dia. Clicar no card abre a cotação completa.
- **Estrela no ativo aberto**: ao lado do ticker da cotação há uma estrela para favoritar/desfavoritar o ativo em um clique.
- **Até 12 favoritos** por usuário. No limite, a estrela bloqueia novos favoritos, mas remover continua liberado.
- **Favoritar não é comprar**: a lista é independente da carteira — não guarda quantidade nem preço médio.
- **Sincronizado entre web e desktop**: as duas aplicações leem e gravam a mesma tabela `public.favorites` no Supabase.
- Sem a migração aplicada, a tela continua funcionando e mostra um aviso no lugar da seção de favoritos.

## O que tem nesta versão

- **Painel**: resumo da carteira e variações do dia
- **Mercado**: cotações da B3 (Brapi) e criptomoedas (CoinGecko), com gráfico de histórico e cards de favoritos
- **Cripto em real ou dólar**: seletor `Real | Dólar` na tela Mercado, disponível apenas para criptomoedas — alterna cotação, variação e eixo do gráfico. Ações da B3 continuam em reais.
- **Carteira**: posições, preço médio e resultado
- **Alertas**: preço-alvo com envio de e-mail

## Como usar

1. Extraia o `.zip` em uma pasta (não execute de dentro do arquivo compactado).
2. Abra `BolsaMonitor.exe`. O pacote é **self-contained**: não é preciso instalar o .NET.
3. Sem configuração, o app abre em **modo demonstração** (dados de exemplo). Para usar sua conta, copie `appsettings.example.json` para `appsettings.json` e preencha Supabase e, opcionalmente, o token da Brapi.

## Versão web

Mesma base, publicada em https://bolsa-monitor.vercel.app

### Favoritos na web

A tela `/mercado` ganhou a mesma faixa de favoritos em cards, com a estrela no ativo
aberto. A ação é um *server action* (`web/app/actions/favorites.ts`): alterna entre
inserir e remover, resolve o `crypto_id` na CoinGecko antes de gravar e revalida a
página. O estado vive na tabela `public.favorites`.

**Passo único de banco:** rode `web/supabase/migrations/0002_favorites.sql` no SQL
Editor do Supabase (depois do `0001_init.sql`). É idempotente. Até isso ser feito, a
página mostra um aviso no lugar da seção e a estrela não grava — nada mais quebra.

### Moeda nos favoritos na web

A faixa de favoritos é buscada com a mesma moeda escolhida na página
(`web/app/(app)/mercado/page.tsx` → `getQuoteMap(..., { currency })`), e os links dos
cards e da busca levam `?currency=USD` adiante (`web/lib/market/types.ts` →
`assetHref`). Assim favoritar, abrir um favorito ou buscar outro ativo não troca a
moeda de exibição.

### Correções da versão anterior (1.0.x)

- **B3 sem token (erro HTTP 401 no mercado)**: a Brapi passou a exigir token em
  `/quote/{ticker}`; sem `BRAPI_TOKEN` a tela de mercado mostrava
  "Falha ao consultar a fonte de dados (HTTP 401)". Agora a camada
  `web/lib/market/stocks.ts` usa Yahoo Finance quando não há token (e como
  fallback quando a Brapi falha), então cotação, gráfico de histórico e busca
  continuam funcionando sem nenhuma credencial. Com `BRAPI_TOKEN` definido, a
  Brapi segue como fonte principal.
- **Link de confirmação de e-mail apontando para localhost**: o domínio do
  `emailRedirectTo` agora é resolvido a partir do próprio request
  (`web/lib/config/site-url.ts`) em vez de uma variável embutida no build. Se o
  Supabase ainda cair na home com `?code=`, `web/proxy.ts` reencaminha para a
  rota que troca o token por sessão.

Código-fonte completo (desktop + web) neste repositório.
