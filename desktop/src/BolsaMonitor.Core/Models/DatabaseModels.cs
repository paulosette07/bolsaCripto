using System.Text.Json.Serialization;

using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace BolsaMonitor.Core.Models;

/*
 * Mapeamento das tabelas do Supabase.
 *
 * `numeric` do PostgREST pode chegar como número OU como string JSON, dependendo
 * da configuração do projeto. `AllowReadingFromString` aceita os dois formatos —
 * sem isso, a desserialização estoura em produção e não em teste.
 */

[Table("portfolio")]
public sealed class PortfolioRow : BaseModel
{
    [PrimaryKey("id")]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("ticker")]
    public string Ticker { get; set; } = string.Empty;

    [Column("asset_type")]
    public string AssetType { get; set; } = "stock";

    [Column("crypto_id")]
    public string? CryptoId { get; set; }

    [Column("quantity")]
    [JsonNumberHandling(JsonNumberHandling.AllowReadingFromString)]
    public decimal Quantity { get; set; }

    [Column("avg_price")]
    [JsonNumberHandling(JsonNumberHandling.AllowReadingFromString)]
    public decimal? AvgPrice { get; set; }

    [Column("notes")]
    public string? Notes { get; set; }

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTimeOffset UpdatedAt { get; set; }
}

[Table("price_alerts")]
public sealed class PriceAlertRow : BaseModel
{
    [PrimaryKey("id")]
    public Guid Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("ticker")]
    public string Ticker { get; set; } = string.Empty;

    [Column("asset_type")]
    public string AssetType { get; set; } = "stock";

    [Column("crypto_id")]
    public string? CryptoId { get; set; }

    /// <summary>`above` ou `below`.</summary>
    [Column("condition")]
    public string Condition { get; set; } = "above";

    [Column("target_price")]
    [JsonNumberHandling(JsonNumberHandling.AllowReadingFromString)]
    public decimal TargetPrice { get; set; }

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("cooldown_minutes")]
    public int CooldownMinutes { get; set; } = 60;

    [Column("last_notified_at")]
    public DateTimeOffset? LastNotifiedAt { get; set; }

    [Column("last_checked_price")]
    [JsonNumberHandling(JsonNumberHandling.AllowReadingFromString)]
    public decimal? LastCheckedPrice { get; set; }

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTimeOffset UpdatedAt { get; set; }

    public AssetRef ToAssetRef() => new(Ticker, AssetTypeExtensions.FromDbValue(AssetType), CryptoId);
}

[Table("alert_events")]
public sealed class AlertEventRow : BaseModel
{
    [PrimaryKey("id")]
    public Guid Id { get; set; }

    [Column("alert_id")]
    public Guid? AlertId { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("ticker")]
    public string Ticker { get; set; } = string.Empty;

    [Column("asset_type")]
    public string AssetType { get; set; } = "stock";

    [Column("condition")]
    public string Condition { get; set; } = "above";

    [Column("target_price")]
    [JsonNumberHandling(JsonNumberHandling.AllowReadingFromString)]
    public decimal TargetPrice { get; set; }

    [Column("price_at_trigger")]
    [JsonNumberHandling(JsonNumberHandling.AllowReadingFromString)]
    public decimal PriceAtTrigger { get; set; }

    [Column("sent_via")]
    public string SentVia { get; set; } = "desktop";

    [Column("provider")]
    public string? Provider { get; set; }

    [Column("status")]
    public string Status { get; set; } = "sent";

    [Column("error_message")]
    public string? ErrorMessage { get; set; }

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; }
}

[Table("profiles")]
public sealed class ProfileRow : BaseModel
{
    [PrimaryKey("id")]
    public Guid Id { get; set; }

    [Column("email")]
    public string Email { get; set; } = string.Empty;

    [Column("full_name")]
    public string? FullName { get; set; }

    [Column("created_at")]
    public DateTimeOffset CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTimeOffset UpdatedAt { get; set; }
}
