using BolsaMonitor.Core.Models;

namespace BolsaMonitor.Core.Portfolio;

/// <summary>Posição já enriquecida com cotação e resultado.</summary>
public sealed record PositionView(
    Guid Id,
    string Ticker,
    AssetType AssetType,
    string? CryptoId,
    string Name,
    decimal Quantity,
    decimal? AvgPrice,
    decimal Price,
    decimal ChangePercent,
    string? LogoUrl,
    decimal MarketValue,
    decimal Cost,
    decimal? Profit,
    decimal? ProfitPercent,
    decimal? Weight,
    bool HasQuote)
{
    /// <summary>Rótulo do tipo em pt-BR para a tabela.</summary>
    public string AssetTypeLabel => AssetType == AssetType.Crypto ? "Cripto" : "Bolsa";
}

/// <summary>Totais da carteira.</summary>
public sealed record PortfolioSummary(
    int PositionsCount,
    int MissingQuotesCount,
    decimal TotalValue,
    decimal TotalCost,
    decimal TotalProfit,
    decimal? TotalProfitPercent,
    decimal DayChangeValue,
    decimal DayChangePercent,
    decimal StockValue,
    decimal CryptoValue);

/// <summary>
/// Toda a matemática da carteira, sem I/O — o mesmo comportamento de
/// `web/lib/portfolio.ts`, para que web e desktop nunca discordem do saldo.
/// </summary>
public static class PortfolioCalculator
{
    /// <summary>Monta as posições com cotação, custo, lucro e peso.</summary>
    public static IReadOnlyList<PositionView> Build(
        IEnumerable<PortfolioRow> rows,
        IReadOnlyDictionary<string, Quote> quotes)
    {
        var positions = new List<PositionView>();

        foreach (var row in rows)
        {
            var assetType = AssetTypeExtensions.FromDbValue(row.AssetType);
            var key = $"{assetType}:{row.Ticker.ToUpperInvariant()}";
            quotes.TryGetValue(key, out var quote);

            var price = quote?.Price ?? 0m;
            var marketValue = price * row.Quantity;
            var cost = (row.AvgPrice ?? 0m) * row.Quantity;
            var hasAvgPrice = row.AvgPrice.HasValue && row.AvgPrice.Value > 0m;
            var profit = hasAvgPrice ? marketValue - cost : (decimal?)null;
            var profitPercent = hasAvgPrice && cost > 0m ? (profit!.Value / cost) * 100m : (decimal?)null;

            positions.Add(new PositionView(
                row.Id,
                row.Ticker.ToUpperInvariant(),
                assetType,
                row.CryptoId,
                quote?.Name ?? row.Ticker.ToUpperInvariant(),
                row.Quantity,
                row.AvgPrice,
                price,
                quote?.ChangePercent ?? 0m,
                quote?.LogoUrl,
                marketValue,
                cost,
                profit,
                profitPercent,
                null,
                quote is not null));
        }

        var total = positions.Sum(position => position.MarketValue);

        return positions
            .Select(position => position with
            {
                Weight = total > 0m ? position.MarketValue / total : null
            })
            .OrderByDescending(position => position.MarketValue)
            .ToList();
    }

    public static PortfolioSummary Summarize(IReadOnlyList<PositionView> positions)
    {
        var totalValue = positions.Sum(position => position.MarketValue);
        var totalCost = positions.Where(position => position.AvgPrice.HasValue).Sum(position => position.Cost);
        var totalProfit = positions.Where(position => position.Profit.HasValue).Sum(position => position.Profit!.Value);
        var totalProfitPercent = totalCost > 0m ? (totalProfit / totalCost) * 100m : (decimal?)null;

        // Variação do dia com a mesma fórmula da web: o percentual informado pela
        // fonte é relativo ao fechamento anterior, então o preço de ontem é
        // price / (1 + pct/100). Usar price * (1 - pct/100) superestima a alta.
        var dayChangeValue = 0m;
        var previousTotal = 0m;

        foreach (var position in positions)
        {
            if (!position.HasQuote)
            {
                continue;
            }

            var divisor = 1m + (position.ChangePercent / 100m);

            if (divisor == 0m)
            {
                continue;
            }

            var previous = position.Price / divisor;

            previousTotal += position.Quantity * previous;
            dayChangeValue += position.Quantity * (position.Price - previous);
        }

        return new PortfolioSummary(
            positions.Count,
            positions.Count(position => !position.HasQuote),
            totalValue,
            totalCost,
            totalProfit,
            totalProfitPercent,
            dayChangeValue,
            previousTotal != 0m ? (dayChangeValue / previousTotal) * 100m : 0m,
            positions.Where(position => position.AssetType == AssetType.Stock).Sum(position => position.MarketValue),
            positions.Where(position => position.AssetType == AssetType.Crypto).Sum(position => position.MarketValue));
    }

    /// <summary>
    /// Compra adicional do mesmo ativo: soma quantidade e recalcula o preço médio
    /// ponderado. Preço médio desconhecido de qualquer lado vira nulo — inventar
    /// um número aqui produziria lucro falso.
    /// </summary>
    public static (decimal Quantity, decimal? AvgPrice) Merge(
        decimal currentQuantity,
        decimal? currentAvgPrice,
        decimal addedQuantity,
        decimal? addedAvgPrice)
    {
        var quantity = currentQuantity + addedQuantity;

        // Mesma regra de `mergeAveragePrice` na web: uma compra sem preço não
        // descarta o custo já conhecido, e um histórico sem custo passa a valer
        // o preço da compra nova em vez de diluir para zero (que geraria lucro
        // artificial na tela).
        if (addedAvgPrice is null)
        {
            return (quantity, currentAvgPrice);
        }

        if (currentAvgPrice is null || currentQuantity <= 0m)
        {
            return (quantity, addedAvgPrice);
        }

        if (quantity <= 0m)
        {
            return (quantity, currentAvgPrice);
        }

        var totalCost = (currentQuantity * currentAvgPrice.Value) + (addedQuantity * addedAvgPrice.Value);

        return (quantity, totalCost / quantity);
    }
}
