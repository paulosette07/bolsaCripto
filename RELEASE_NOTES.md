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

Código-fonte completo (desktop + web) neste repositório.
