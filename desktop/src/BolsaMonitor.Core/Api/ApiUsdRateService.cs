using BolsaMonitor.Core.Market;
using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Core.Api;

/// <summary>
/// Dólar servido por `GET /api/fx` — modo hospedado.
///
/// A rota é pública (não exige token): o app mostra a faixa do dólar já na tela
/// de login, antes de existir sessão. O servidor é quem fala com o BCB, então
/// o desktop não precisa saber a URL do Banco Central.
///
/// Cache de 5 minutos, igual à faixa da web: é a mesma informação e não faz
/// sentido consultar mais vezes do que ela muda.
/// </summary>
public sealed class ApiUsdRateService : IUsdRateService
{
    private static readonly TimeSpan CacheLifetime = TimeSpan.FromMinutes(5);

    private readonly ApiClient _api;
    private readonly SemaphoreSlim _gate = new(1, 1);

    private UsdRateSnapshot? _cached;

    public ApiUsdRateService(ApiClient api)
    {
        _api = api;
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

            var json = await _api.GetPublicAsync("/api/fx", cancellationToken).ConfigureAwait(false);
            var snapshot = ApiJson.ParseFx(json);

            _cached = snapshot;

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
}
