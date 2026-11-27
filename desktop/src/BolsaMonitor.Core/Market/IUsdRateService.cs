using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Core.Market;

/// <summary>
/// Cotação do dólar comercial para a faixa fixa do app.
///
/// Fica separada de <see cref="IMacroService"/> (que devolve a faixa inteira de
/// indicadores) porque o dólar aparece **em todas as telas**, inclusive na tela
/// de login — não pode depender de o painel estar carregado.
/// </summary>
public interface IUsdRateService
{
    /// <summary>`null` quando nenhuma fonte respondeu agora.</summary>
    Task<UsdRateSnapshot?> GetAsync(CancellationToken cancellationToken = default);
}
