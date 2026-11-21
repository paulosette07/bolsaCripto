# Bolsa Monitor — app desktop (WPF)

Cliente Windows do Bolsa Monitor: acompanha cotações da B3 e criptomoedas em reais,
controla a carteira em quantidade exata de cotas e dispara alertas de preço por e-mail.
Usa o **mesmo Supabase** do app web, então carteira e alertas são compartilhados entre
as duas interfaces.

## Requisitos

- Windows 10/11
- [.NET SDK 8.0](https://dotnet.microsoft.com/download/dotnet/8.0) (`dotnet --version` deve responder 8.x)

## Como rodar

```powershell
# a partir da raiz do repositório
dotnet build desktop/BolsaMonitor.slnx
dotnet run --project desktop/src/BolsaMonitor.Desktop
```

O executável também fica em
`desktop/src/BolsaMonitor.Desktop/bin/Debug/net8.0-windows/BolsaMonitor.Desktop.exe`.

### Modo demonstração (sem chaves, sem rede)

```powershell
dotnet run --project desktop/src/BolsaMonitor.Desktop -- --demo
```

O modo demo troca as três dependências externas por implementações em memória
(`desktop/src/BolsaMonitor.Desktop/Demo/`):

- catálogo fixo de nove ativos (PETR4, VALE3, ITUB4, BBDC4, HGLG11, MXRF11, BTC, ETH, SOL)
  com histórico gerado por random walk semeado — os gráficos são reais, só não são cotações vivas;
- carteira de exemplo com cinco posições;
- três alertas e três eventos de disparo no histórico.

Serve para revisar layout e fluxo completo sem configurar nada.

## Configuração

Copie o modelo e preencha as chaves:

```powershell
Copy-Item desktop/src/BolsaMonitor.Desktop/appsettings.example.json `
          desktop/src/BolsaMonitor.Desktop/appsettings.json
```

O arquivo é copiado para o diretório de saída no build e **não é versionado**
(ver `desktop/.gitignore`). Variáveis de ambiente com o mesmo nome sobrescrevem o arquivo.

| Chave | Para que serve |
| --- | --- |
| `SupabaseUrl` / `SupabaseAnonKey` | Login e persistência. Sem eles o app abre a tela de login já avisando que falta configuração. |
| `BrapiToken` | Opcional. Sem token a Brapi responde com limite menor. |
| `CoinGeckoApiKey` | Opcional. Enviado como `x-cg-demo-api-key`. |
| `EmailProvider` | `resend` (padrão) ou `smtp`. |
| `ResendApiKey` / `ResendFrom` | Envio via Resend. |
| `SmtpHost` / `SmtpPort` / `SmtpSecure` / `SmtpUser` / `SmtpPassword` / `SmtpFrom` | Envio via SMTP (ex.: Gmail com senha de app). |
| `AlertPollMinutes` | Intervalo do verificador local de alertas. Padrão 5 minutos. |

Só Supabase é obrigatório. Sem e-mail configurado o app funciona normalmente e mostra
um aviso na tela de Alertas — você continua vendo quais alertas seriam disparados.

## Alertas

A checagem roda em dois lugares, de propósito:

1. **No servidor** (`web/app/api/alerts/check`, acionado pelo cron do GitHub Actions) —
   garante o disparo mesmo com o app fechado.
2. **Neste app**, a cada `AlertPollMinutes` e no botão *Verificar agora*.

Os dois caminhos usam a mesma trava (`TryClaimAsync`, que grava `last_notified_at` antes
de enviar), então nunca saem dois e-mails do mesmo alerta.

## Testes

```powershell
dotnet test desktop/src/BolsaMonitor.Core.Tests
```

51 testes cobrindo a matemática da carteira, a avaliação de alertas e a formatação pt-BR.
São testes puros: nenhum toca rede, banco ou disco.

## Estrutura

```
desktop/
├── BolsaMonitor.slnx
└── src/
    ├── BolsaMonitor.Core/          # sem WPF: pode ser testado e reusado
    │   ├── Alerts/                 # AlertEvaluator (regras) e AlertMonitor (execução)
    │   ├── Data/                   # SupabaseGateway e repositórios
    │   ├── Email/                  # Resend, SMTP e o HTML do e-mail
    │   ├── Formatting/             # BrlFormat — moeda, percentual, datas em pt-BR
    │   ├── Market/                 # Brapi, CoinGecko e o serviço que unifica os dois
    │   ├── Models/                 # records de mercado e do banco
    │   ├── Options/                # AppOptions
    │   ├── Persistence/            # SessionStore (sessão do Supabase em disco)
    │   └── Portfolio/              # PortfolioCalculator — toda a matemática da carteira
    ├── BolsaMonitor.Desktop/       # WPF
    │   ├── Charts/                 # PriceChartFactory (LiveCharts)
    │   ├── Converters/             # conversores de binding
    │   ├── Demo/                   # implementações em memória do modo --demo
    │   ├── Interop/                # DarkTitleBar (DWM)
    │   ├── Resources/Theme.xaml    # paleta e estilos compartilhados
    │   ├── ViewModels/             # MVVM com CommunityToolkit.Mvvm
    │   └── Views/                  # XAML
    └── BolsaMonitor.Core.Tests/    # xUnit
```

`BolsaMonitor.Core` não referencia WPF: dá para rodar em teste e reaproveitar em outro host.

## Paridade com o app web

O desktop não é uma reimplementação livre — ele segue o web, que é a referência:

- **Carteira**: `PortfolioCalculator` reproduz `web/lib/portfolio.ts`, inclusive a variação
  do dia, que usa `preço / (1 + percentual/100)` para recuperar o fechamento anterior.
  Usar `preço * (1 - percentual/100)` superestimaria a alta.
- **Alertas**: mesmas colunas (`condition`, `target_price`, `last_notified_at`,
  `cooldown_minutes`, `provider`) e as mesmas regras de `web/lib/alerts/run.ts`.
- **Cotações**: mesmas fontes e o mesmo formato de chave (`Stock:PETR4`, `Crypto:BTC`),
  então as duas interfaces leem o mesmo cache e concordam nos números.

## Aparência

Tema escuro com acento esmeralda e numerais monoespaçados, espelhando o app web.
A paleta e os estilos ficam todos em `desktop/src/BolsaMonitor.Desktop/Resources/Theme.xaml`
— inclusive o template próprio de `ComboBox` e `ScrollBar`, porque os padrões do Windows
são claros e quebrariam o tema.
