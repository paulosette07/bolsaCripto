namespace BolsaMonitor.Core.Models;

/// <summary>
/// Cotação do dólar comercial com a variação do dia.
///
/// É o número que a faixa fixa do app mostra em todas as telas — a mesma
/// informação que a web exibe no topo. Espelha o contrato `FxSnapshotJson` de
/// `web/lib/market/fx-snapshot.ts`, para as duas interfaces concordarem.
/// </summary>
public sealed record UsdRateSnapshot(
    /// <summary>Quantos reais vale 1 dólar.</summary>
    decimal Rate,
    /// <summary>Variação percentual contra o ponto anterior da série.</summary>
    decimal? ChangePercent,
    /// <summary>Data de referência informada pela fonte.</summary>
    DateOnly? ReferenceDate,
    /// <summary>`bcb`, `yahoo` ou `api` (quando veio do servidor do Bolsa Monitor).</summary>
    string Source,
    /// <summary>Momento em que o app leu o número.</summary>
    DateTimeOffset FetchedAt);
