Aplicativo desktop do Bolsa Monitor para Windows 10/11 de 64 bits.

**Download:** `BolsaMonitor-win-x64-1.1.0.zip` (104 MB) — extraia a pasta e execute `BolsaMonitor.exe`.

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
