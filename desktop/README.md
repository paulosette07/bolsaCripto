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

## Modos de dados

O app tem três montagens, escolhidas em `App.xaml.cs` e em nenhum outro lugar:

| Modo | Como é ligado | De onde vêm os dados |
| --- | --- | --- |
| **Hospedado** (padrão da release) | `appsettings.defaults.json` já traz `ApiBaseUrl` | servidor do Bolsa Monitor (`/api/app/*`), com o token do próprio usuário |
| **Direto** | `ApiBaseUrl` vazio | Brapi, CoinGecko, Yahoo e BCB consultados pelo app |
| **Demonstração** | `--demo` na linha de comando | dados em memória, sem rede |

No modo hospedado a release **não carrega chave de provider nenhuma**: nem Brapi, nem
CoinGecko, nem Resend/SMTP. Quem tem as credenciais é o servidor. O que o app guarda é só
`SupabaseUrl` + a chave **anon**, que é pública por design — a mesma que vai no navegador,
com acesso limitado por RLS.

Só o que é dado do usuário (carteira, favoritos, alertas) continua indo direto ao Supabase,
com o token dele: são linhas protegidas por RLS e não passam por servidor intermediário.

Precedência de configuração, do mais fraco ao mais forte: `appsettings.defaults.json` →
`appsettings.json` → variáveis de ambiente `BOLSAMONITOR_*`.

### Faixa do dólar

A cotação do dólar comercial aparece no rodapé de **todas** as telas, inclusive no login —
antes de existir sessão. Ela usa `GET /api/fx`, que é público justamente por isso, e se
atualiza junto com a verificação de alertas (a cada 5 minutos). Se a fonte cair, a faixa
mantém o último número em vez de sumir.

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

**No modo hospedado não é preciso criar arquivo nenhum**: `appsettings.defaults.json`
(versionado, só dados públicos) já aponta para o servidor e para o Supabase. Baixar o
executável e abrir basta.

Para o modo **direto**, copie o modelo e preencha as chaves do seu provedor:

```powershell
Copy-Item desktop/src/BolsaMonitor.Desktop/appsettings.example.json `
          desktop/src/BolsaMonitor.Desktop/appsettings.json
```

`appsettings.json` é copiado para o diretório de saída no build e **não é versionado**
(ver `desktop/.gitignore`). Ele sobrescreve os defaults chave por chave — dá para trocar
só o `SupabaseUrl`, por exemplo, sem repetir o resto.

| Chave | Para que serve |
| --- | --- |
| `ApiBaseUrl` | Endereço do servidor. **Preenchido = modo hospedado**; vazio = modo direto. |
| `SupabaseUrl` / `SupabaseAnonKey` | Login e persistência. Sem eles o app abre a tela de login já avisando que falta configuração. |
| `BrapiToken` | Só no modo direto. Sem token a Brapi responde com limite menor. |
| `CoinGeckoApiKey` | Só no modo direto. Enviado como `x-cg-demo-api-key`. |
| `EmailProvider` | Só no modo direto: `resend` (padrão) ou `smtp`. |
| `ResendApiKey` / `ResendFrom` | Envio via Resend (modo direto). |
| `SmtpHost` / `SmtpPort` / `SmtpSecure` / `SmtpUser` / `SmtpPassword` / `SmtpFrom` | Envio via SMTP (modo direto; ex.: Gmail com senha de app). |

Só Supabase é obrigatório. No modo direto, sem e-mail configurado o app funciona
normalmente e mostra um aviso na tela de Alertas — você continua vendo quais alertas
seriam disparados. No modo hospedado esse aviso nem aparece: quem envia é o servidor.

## Alertas

A checagem roda em mais de um lugar, de propósito:

1. **Cron do servidor** (`web/app/api/alerts/check`, via GitHub Actions) — garante o
   disparo com o app fechado.
2. **Neste app**, a cada 5 minutos e no botão *Verificar agora*.

Quem executa o passo 2 depende do modo de dados:

- **hospedado**: o app faz `POST /api/app/alerts/check` e o **servidor** cota, avalia e
  envia (`ApiAlertRunner`). É por isso que a release não precisa de credencial de e-mail;
- **direto/demonstração**: o `AlertMonitor` roda dentro do app, com as credenciais do
  `appsettings.json`.

Os caminhos compartilham a mesma trava (`TryClaimAsync`, que grava `last_notified_at` antes
de enviar), então nunca saem dois e-mails do mesmo alerta — nem quando o desktop e o cron
rodam no mesmo minuto.

## Testes

```powershell
dotnet test desktop/src/BolsaMonitor.Core.Tests
```

88 testes: matemática da carteira, avaliação de alertas, formatação pt-BR, parsing de RSS e
o **contrato JSON** de `/api/app/*` (`ApiJsonTests`). São testes puros: nenhum toca rede,
banco ou disco.

O bloco de contrato existe porque o desktop hospedado não vê o código da web: se um campo
mudar de nome no servidor, o app quebraria em produção sem build vermelho. Cada teste fixa
o JSON que a API devolve hoje.

## Estrutura

```
desktop/
├── BolsaMonitor.slnx
└── src/
    ├── BolsaMonitor.Core/          # sem WPF: pode ser testado e reusado
    │   ├── Alerts/                 # AlertEvaluator (regras), IAlertRunner, AlertMonitor (execução local)
    │   ├── Api/                    # cliente do servidor (/api/app/*), DTOs e parsers do JSON
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
