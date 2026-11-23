Aplicativo desktop do Bolsa Monitor para Windows 10/11 de 64 bits.

**Download:** `BolsaMonitor-win-x64-1.0.0.zip` (104 MB) — extraia a pasta e execute `BolsaMonitor.exe`.

## O que tem nesta versão

- **Painel**: resumo da carteira e variações do dia
- **Mercado**: cotações da B3 (Brapi) e criptomoedas (CoinGecko), com gráfico de histórico
- **Cripto em real ou dólar**: seletor `Real | Dólar` na tela Mercado, disponível apenas para criptomoedas — alterna cotação, variação e eixo do gráfico. Ações da B3 continuam em reais.
- **Carteira**: posições, preço médio e resultado
- **Alertas**: preço-alvo com envio de e-mail

## Como usar

1. Extraia o `.zip` em uma pasta (não execute de dentro do arquivo compactado).
2. Abra `BolsaMonitor.exe`. O pacote é **self-contained**: não é preciso instalar o .NET.
3. Sem configuração, o app abre em **modo demonstração** (dados de exemplo). Para usar sua conta, copie `appsettings.example.json` para `appsettings.json` e preencha Supabase e, opcionalmente, o token da Brapi.

## Versão web

Mesma base, publicada em https://bolsa-monitor.vercel.app

### Correções nesta atualização

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
