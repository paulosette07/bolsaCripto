using System.Text.Json.Serialization;

namespace BolsaMonitor.Core.Api;

/// <summary>
/// Espelho dos payloads de `/api/app/*` do servidor web.
///
/// São DTOs "burros" de propósito: só descrevem o JSON. A conversão para os
/// modelos de domínio (e as decisões de descarte) ficam em <see cref="ApiJson"/>,
/// que é pura e testável sem rede.
/// </summary>
internal sealed record QuotesPayload(
    List<QuotePayload>? Quotes,
    string? Currency,
    string? Error);

internal sealed record QuotePayload(
    string? Ticker,
    string? AssetType,
    string? CryptoId,
    string? Name,
    decimal? Price,
    decimal? ChangePercent,
    decimal? ChangeValue,
    decimal? PreviousClose,
    string? Currency,
    string? LogoUrl,
    string? UpdatedAt);

internal sealed record HistoryPayload(
    string? Ticker,
    string? AssetType,
    string? CryptoId,
    string? Currency,
    List<HistoryPointPayload>? Points,
    string? Error);

internal sealed record HistoryPointPayload(long? Timestamp, decimal? Price);

internal sealed record SearchPayload(List<SearchItemPayload>? Results, string? Error);

internal sealed record SearchItemPayload(
    string? Ticker,
    string? AssetType,
    string? CryptoId,
    string? Name,
    string? LogoUrl);

internal sealed record MacroPayload(
    List<MacroQuotePayload>? Quotes,
    List<MacroRatePayload>? Rates);

internal sealed record MacroQuotePayload(
    string? Id,
    string? Label,
    string? Subtitle,
    decimal? Value,
    string? Unit,
    decimal? ChangePercent,
    decimal? ChangeValue,
    decimal? DayLow,
    decimal? DayHigh,
    decimal? UsdPerOunce,
    string? UpdatedAt);

internal sealed record MacroRatePayload(
    string? Id,
    string? Label,
    decimal? Value,
    string? ReferenceDate,
    string? Note);

internal sealed record NewsPayload(List<NewsItemPayload>? Items, string? Error);

internal sealed record NewsItemPayload(
    string? Title,
    string? Url,
    string? Source,
    string? PublishedAt,
    string? Scope,
    string? Summary);

internal sealed record AlertCheckPayload(
    bool? Ok,
    int? AlertsChecked,
    int? ConditionsMet,
    int? EmailsSent,
    int? EmailsFailed,
    int? AlertsWithoutQuote,
    List<string>? Errors,
    string? Error);

internal sealed record FxPayload(
    decimal? Rate,
    decimal? ChangePercent,
    string? ReferenceDate,
    string? Source,
    [property: JsonPropertyName("fetchedAt")] string? FetchedAt);
