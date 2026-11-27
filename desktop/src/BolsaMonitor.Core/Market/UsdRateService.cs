using System.Globalization;
using System.Text.Json;

using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Core.Market;

/// <summary>
/// Dólar comercial consultado direto nas fontes públicas — usado quando o app
/// roda em **modo direto** (código-fonte configurado pelo próprio usuário).
///
/// Espelha a ordem de `web/lib/market/fx.ts`:
///  1. **BCB SGS 10813**: dólar comercial de venda, oficial, dois pontos para
///     dar a variação do dia;
///  2. **AwesomeAPI** (`USD-BRL`): quando o BCB não publica (fim de semana).
///
/// Cache de **5 minutos**, a mesma cadência da faixa do topo: o número muda
/// de janela em janela sem martelar o Banco Central a cada navegação.
/// </summary>
public sealed class UsdRateService : IUsdRateService
{
    private const string BcbUrl =
        "https://api.bcb.gov.br/dados/serie/bcdata.sgs.10813/dados/ultimos/2?formato=json";

    private const string AwesomeUrl = "https://economia.awesomeapi.com.br/last/USD-BRL";

    /// <summary>Dólar entre 1 e 20 reais: fora disso é erro de parsing.</summary>
    private const decimal MinPlausibleRate = 1m;
    private const decimal MaxPlausibleRate = 20m;

    private static readonly TimeSpan CacheLifetime = TimeSpan.FromMinutes(5);

    private readonly HttpClient _httpClient;
    private readonly SemaphoreSlim _gate = new(1, 1);

    private UsdRateSnapshot? _cached;

    public UsdRateService(HttpClient httpClient)
    {
        _httpClient = httpClient;
        _httpClient.Timeout = TimeSpan.FromSeconds(15);
    }

    public async Task<UsdRateSnapshot?> GetAsync(CancellationToken cancellationToken = default)
    {
        var cached = ReadCache();

        if (cached is not null)
        {
            return cached;
        }

        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);

        try
        {
            cached = ReadCache();

            if (cached is not null)
            {
                return cached;
            }

            var snapshot = await FetchFromBcbAsync(cancellationToken).ConfigureAwait(false)
                ?? await FetchFromAwesomeAsync(cancellationToken).ConfigureAwait(false);

            if (snapshot is not null)
            {
                _cached = snapshot;
            }

            return snapshot;
        }
        finally
        {
            _gate.Release();
        }
    }

    private UsdRateSnapshot? ReadCache() =>
        _cached is not null && DateTimeOffset.UtcNow - _cached.FetchedAt < CacheLifetime
            ? _cached
            : null;

    private async Task<UsdRateSnapshot?> FetchFromBcbAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var document = await GetJsonAsync(BcbUrl, cancellationToken).ConfigureAwait(false);
            var root = document.RootElement;

            if (root.ValueKind != JsonValueKind.Array || root.GetArrayLength() == 0)
            {
                return null;
            }

            var latest = root[root.GetArrayLength() - 1];
            var rate = ReadBcbValue(latest);

            if (rate is null)
            {
                return null;
            }

            // Fim de semana/feriado: um ponto só e não há base de comparação.
            decimal? previous = root.GetArrayLength() > 1
                ? ReadBcbValue(root[root.GetArrayLength() - 2])
                : null;

            return new UsdRateSnapshot(
                rate.Value,
                PercentChange(rate.Value, previous),
                ReadBcbDate(latest),
                "bcb",
                DateTimeOffset.UtcNow);
        }
        catch (Exception exception) when (IsTransportFailure(exception))
        {
            return null;
        }
    }

    private async Task<UsdRateSnapshot?> FetchFromAwesomeAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var document = await GetJsonAsync(AwesomeUrl, cancellationToken).ConfigureAwait(false);
            var root = document.RootElement;

            if (!root.TryGetProperty("USDBRL", out var pair) ||
                !pair.TryGetProperty("bid", out var bid) ||
                bid.ValueKind != JsonValueKind.String)
            {
                return null;
            }

            var rate = ParseDecimal(bid.GetString(), allowComma: false);

            if (!IsPlausible(rate))
            {
                return null;
            }

            var change = ReadPairDecimal(pair, "pctChange");

            return new UsdRateSnapshot(rate!.Value, change, null, "awesomeapi", DateTimeOffset.UtcNow);
        }
        catch (Exception exception) when (IsTransportFailure(exception))
        {
            return null;
        }
    }

    private static decimal? ReadBcbValue(JsonElement element)
    {
        if (!element.TryGetProperty("valor", out var valor) || valor.ValueKind != JsonValueKind.String)
        {
            return null;
        }

        // O BCB publica "5,7487" (vírgula decimal).
        var parsed = ParseDecimal(valor.GetString(), allowComma: true);

        return IsPlausible(parsed) ? parsed : null;
    }

    private static decimal? ReadPairDecimal(JsonElement pair, string property)
    {
        if (!pair.TryGetProperty(property, out var found) || found.ValueKind != JsonValueKind.String)
        {
            return null;
        }

        return ParseDecimal(found.GetString(), allowComma: false);
    }

    /// <summary>`25/11/2026` (dd/MM/yyyy do BCB) -> data tipada.</summary>
    private static DateOnly? ReadBcbDate(JsonElement element)
    {
        if (!element.TryGetProperty("data", out var property) ||
            property.ValueKind != JsonValueKind.String)
        {
            return null;
        }

        return DateOnly.TryParseExact(
            property.GetString(),
            "dd/MM/yyyy",
            CultureInfo.InvariantCulture,
            DateTimeStyles.None,
            out var parsed)
            ? parsed
            : null;
    }

    private static decimal? PercentChange(decimal current, decimal? previous) =>
        previous is > 0m ? (current - previous.Value) / previous.Value * 100m : null;

    private static bool IsPlausible(decimal? value) =>
        value is > MinPlausibleRate and < MaxPlausibleRate;

    private static decimal? ParseDecimal(string? raw, bool allowComma)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        var normalized = allowComma ? raw.Trim().Replace(',', '.') : raw.Trim();

        return decimal.TryParse(normalized, NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : null;
    }

    private static bool IsTransportFailure(Exception exception) =>
        exception is MarketDataException or HttpRequestException or JsonException or TaskCanceledException;

    private async Task<JsonDocument> GetJsonAsync(string url, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.TryAddWithoutValidation("accept", "application/json");

        using var response = await _httpClient
            .SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken)
            .ConfigureAwait(false);

        if (!response.IsSuccessStatusCode)
        {
            throw new MarketDataException($"A fonte de dados respondeu HTTP {(int)response.StatusCode}.");
        }

        await using var stream = await response.Content
            .ReadAsStreamAsync(cancellationToken)
            .ConfigureAwait(false);

        return await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);
    }
}
