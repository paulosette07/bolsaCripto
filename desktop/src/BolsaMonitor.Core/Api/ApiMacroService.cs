using BolsaMonitor.Core.Market;
using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Core.Api;

/// <summary>
/// Indicadores macro servidos por `GET /api/app/macro`.
///
/// Uma requisição devolve os dois blocos (indicadores e juros), então guardamos
/// o resultado por alguns segundos: a tela pede os dois em sequência e não faz
/// sentido bater no servidor duas vezes para a mesma resposta.
/// </summary>
public sealed class ApiMacroService : IMacroService
{
    /// <summary>Curto de propósito: o painel atualiza a cada 5 minutos.</summary>
    private static readonly TimeSpan CacheLifetime = TimeSpan.FromSeconds(30);

    private readonly ApiClient _api;
    private readonly SemaphoreSlim _gate = new(1, 1);

    private (IReadOnlyList<MacroQuote> Quotes, IReadOnlyList<MacroRate> Rates)? _cached;
    private DateTimeOffset _cachedAt;

    public ApiMacroService(ApiClient api)
    {
        _api = api;
    }

    public async Task<IReadOnlyList<MacroQuote>> GetQuotesAsync(CancellationToken cancellationToken = default) =>
        (await LoadAsync(cancellationToken).ConfigureAwait(false)).Quotes;

    public async Task<IReadOnlyList<MacroRate>> GetRatesAsync(CancellationToken cancellationToken = default) =>
        (await LoadAsync(cancellationToken).ConfigureAwait(false)).Rates;

    private async Task<(IReadOnlyList<MacroQuote> Quotes, IReadOnlyList<MacroRate> Rates)> LoadAsync(
        CancellationToken cancellationToken)
    {
        var cached = ReadCache();

        if (cached is not null)
        {
            return cached.Value;
        }

        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);

        try
        {
            cached = ReadCache();

            if (cached is not null)
            {
                return cached.Value;
            }

            var json = await _api.GetAsync("/api/app/macro", cancellationToken).ConfigureAwait(false);
            var parsed = ApiJson.ParseMacro(json);

            _cached = parsed;
            _cachedAt = DateTimeOffset.UtcNow;

            return parsed;
        }
        finally
        {
            _gate.Release();
        }
    }

    private (IReadOnlyList<MacroQuote> Quotes, IReadOnlyList<MacroRate> Rates)? ReadCache() =>
        _cached is not null && DateTimeOffset.UtcNow - _cachedAt < CacheLifetime ? _cached : null;
}
