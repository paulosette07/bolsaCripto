namespace BolsaMonitor.Core.Models;

/// <summary>
/// Unidade de um indicador macro. Espelha o tipo `MacroUnit` da web:
///
///  - <see cref="Currency"/>: reais (cotação do dólar/euro);
///  - <see cref="GoldGram"/>: reais por grama de ouro (o metal é negociado em onça-troy);
///  - <see cref="Index"/>: pontos de índice (Ibovespa).
/// </summary>
public enum MacroUnit
{
    Currency,
    GoldGram,
    Index
}

/// <summary>
/// Indicador do topo do painel. Mesmos campos do contrato TypeScript
/// (`web/lib/market/macro.ts`), para as duas telas mostrarem o mesmo número.
/// </summary>
public sealed record MacroQuote(
    /// <summary>`usd-brl`, `eur-brl`, `gold` ou `ibov`.</summary>
    string Id,
    string Label,
    string Subtitle,
    decimal Value,
    MacroUnit Unit,
    decimal ChangePercent,
    decimal ChangeValue,
    decimal? DayLow,
    decimal? DayHigh,
    /// <summary>Preço da onça-troy em dólar. Só o ouro preenche.</summary>
    decimal? UsdPerOunce,
    DateTimeOffset UpdatedAt);

/// <summary>Juros/inflação de referência (Banco Central).</summary>
public sealed record MacroRate(
    string Id,
    string Label,
    /// <summary>Percentual ao ano (13.75 = 13,75% a.a.).</summary>
    decimal Value,
    DateOnly? ReferenceDate,
    string Note);

/// <summary>
/// Retrato de um símbolo do Yahoo (índice, moeda, commodity).
/// Separado de <see cref="Quote"/> porque não representa um ativo negociável
/// na B3 e não passa pelos providers de ação.
/// </summary>
public sealed record MarketSnapshot(
    string Symbol,
    string Name,
    decimal Price,
    decimal ChangePercent,
    decimal ChangeValue,
    decimal? DayLow,
    decimal? DayHigh,
    string Currency,
    DateTimeOffset UpdatedAt);
