using System.Text.Json;
using Crm.Api.Models;

namespace Crm.Api.Services;

public record PrimWeights(decimal Revenue = 55, decimal Conversion = 25, decimal Quality = 10, decimal Manager = 10);
public record PrimBand(decimal Min, decimal Percent);

// Rounding: "Down" (aşağı), "Nearest" (en yakın tam sayı), "None" (yuvarlama yok). Şirket kuralı netleşince Ayarlar'dan değişir.
public record PrimConfig(PrimWeights Weights, decimal ConversionTarget, string Rounding, List<PrimBand> Bands)
{
    public static PrimConfig Default => new(new PrimWeights(), 7, "Down",
    [
        new(95, 5), new(90, 4), new(75, 3), new(60, 2), new(45, 1), new(1, 0),
    ]);
}

// Aylık elle girilen veriler. Boş = girilmedi.
public record PrimInputs(decimal? Leads, decimal? Deposits, decimal? RateOverride, decimal? Quality, decimal? Manager);

public record PrimItem(decimal Max, decimal Points);
public record PrimResult(
    decimal Revenue, decimal? RevenueTarget, PrimItem RevenueScore,
    decimal? ConversionRate, bool ConversionOverridden, PrimItem ConversionScore,
    PrimItem QualityScore, PrimItem ManagerScore,
    decimal TotalPoints, decimal BandPercent, decimal? BandMin, decimal Prim);

public static class PrimService
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static string Key(int year, int month) => $"Prim:Inputs:{year}-{month:00}";
    public const string ConfigKey = "Prim:Config";

    public static PrimConfig ParseConfig(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return PrimConfig.Default;
        try { return JsonSerializer.Deserialize<PrimConfig>(json, Json) ?? PrimConfig.Default; }
        catch (JsonException) { return PrimConfig.Default; }
    }

    public static PrimInputs ParseInputs(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new(null, null, null, null, null);
        try { return JsonSerializer.Deserialize<PrimInputs>(json, Json) ?? new(null, null, null, null, null); }
        catch (JsonException) { return new(null, null, null, null, null); }
    }

    private static decimal Round(decimal v, string mode) => mode switch
    {
        "Down" => Math.Floor(v),
        "Nearest" => Math.Round(v, 0, MidpointRounding.AwayFromZero),
        _ => Math.Round(v, 2),
    };

    // Puan = ağırlık * gerçekleşen / hedef, [0, ağırlık] aralığında, sonra yuvarlama kuralı.
    private static decimal Prorate(decimal weight, decimal actual, decimal target, string rounding) =>
        target <= 0 ? 0 : Math.Min(weight, Round(weight * actual / target, rounding));

    public static PrimResult Calculate(PrimConfig cfg, decimal revenue, decimal? revenueTarget, PrimInputs input)
    {
        var w = cfg.Weights;

        var revPts = revenueTarget is > 0 ? Prorate(w.Revenue, revenue, revenueTarget.Value, cfg.Rounding) : 0;

        decimal? rate = input.RateOverride
            ?? (input.Leads is > 0 && input.Deposits is not null ? input.Deposits / input.Leads * 100 : null);
        var convPts = rate is null ? 0 : Prorate(w.Conversion, rate.Value, cfg.ConversionTarget, cfg.Rounding);

        var quality = Math.Clamp(input.Quality ?? 0, 0, w.Quality);
        var manager = Math.Clamp(input.Manager ?? 0, 0, w.Manager);

        var total = revPts + convPts + quality + manager;
        var band = cfg.Bands.OrderByDescending(b => b.Min).FirstOrDefault(b => total >= b.Min);
        var pct = band?.Percent ?? 0;

        return new PrimResult(
            revenue, revenueTarget, new(w.Revenue, revPts),
            rate is null ? null : Math.Round(rate.Value, 2), input.RateOverride is not null, new(w.Conversion, convPts),
            new(w.Quality, quality), new(w.Manager, manager),
            total, pct, band?.Min, Math.Round(revenue * pct / 100, 2));
    }
}
