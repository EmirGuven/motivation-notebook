using System.Globalization;
using System.Text.Json;
using Crm.Api.Data;
using Crm.Api.Models;
using Crm.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Endpoints;

public record PrimInputRequest(int Year, int Month, decimal? Leads, decimal? Deposits, decimal? RateOverride, decimal? Quality, decimal? Manager);

public static class PrimEndpoints
{
    // Aylık ciro: iptaller hariç, kayıt anındaki kurla TL (Dashboard ile aynı kural).
    private static async Task<Dictionary<int, decimal>> RevenueByMonth(CrmDbContext db, int year)
    {
        var from = new DateTime(year, 1, 1);
        var rows = await db.Surgeries.AsNoTracking()
            .Where(s => s.Date >= from && s.Date < from.AddYears(1) && s.Status != SurgeryStatus.Cancelled)
            .Select(s => new { s.Date, s.Price, s.RateToTry }).ToListAsync();
        return rows.GroupBy(r => r.Date.Month).ToDictionary(g => g.Key, g => g.Sum(r => r.Price * r.RateToTry));
    }

    private static decimal? Target(Dictionary<string, string> st, int year, int month) =>
        st.TryGetValue($"Target:{year}-{month:00}", out var v)
        && decimal.TryParse(v, NumberStyles.Any, CultureInfo.InvariantCulture, out var d) && d > 0 ? d : null;

    public static void MapPrimEndpoints(this WebApplication app)
    {
        var g = app.MapGroup("/api/prim");

        g.MapGet("/config", async (CrmDbContext db) =>
            Results.Ok(PrimService.ParseConfig((await db.Settings.FindAsync(PrimService.ConfigKey))?.Value)));

        g.MapPut("/config", async (PrimConfig c, CrmDbContext db) =>
        {
            if (c.Weights.Revenue < 0 || c.Weights.Conversion < 0 || c.Weights.Quality < 0 || c.Weights.Manager < 0)
                return Results.BadRequest("Puan ağırlıkları negatif olamaz.");
            if (c.ConversionTarget <= 0) return Results.BadRequest("Dönüşüm hedefi 0'dan büyük olmalı.");
            if (c.Rounding is not ("Down" or "Nearest" or "None")) return Results.BadRequest("Geçersiz yuvarlama.");
            if (c.Bands.Any(b => b.Min < 0 || b.Percent < 0)) return Results.BadRequest("Kademe değerleri negatif olamaz.");
            var json = JsonSerializer.Serialize(c with { Bands = c.Bands.OrderByDescending(b => b.Min).ToList() }, PrimService.Json);
            var row = await db.Settings.FindAsync(PrimService.ConfigKey);
            if (row is null) db.Settings.Add(new AppSetting { Key = PrimService.ConfigKey, Value = json });
            else row.Value = json;
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // Tek ay: puan dökümü + girilen veriler
        g.MapGet("/", async (int year, int month, CrmDbContext db) =>
        {
            if (month is < 1 or > 12) return Results.BadRequest("Ay 1-12 arası olmalı.");
            var st = await db.Settings.AsNoTracking().ToDictionaryAsync(s => s.Key, s => s.Value);
            var cfg = PrimService.ParseConfig(st.GetValueOrDefault(PrimService.ConfigKey));
            var inputs = PrimService.ParseInputs(st.GetValueOrDefault(PrimService.Key(year, month)));
            var revenue = (await RevenueByMonth(db, year)).GetValueOrDefault(month);
            var result = PrimService.Calculate(cfg, revenue, Target(st, year, month), inputs);
            return Results.Ok(new { year, month, config = cfg, inputs, result });
        });

        g.MapPut("/inputs", async (PrimInputRequest r, CrmDbContext db) =>
        {
            if (r.Month is < 1 or > 12) return Results.BadRequest("Ay 1-12 arası olmalı.");
            if (new[] { r.Leads, r.Deposits, r.RateOverride, r.Quality, r.Manager }.Any(v => v < 0)) return Results.BadRequest("Değerler negatif olamaz.");
            var key = PrimService.Key(r.Year, r.Month);
            var empty = r.Leads is null && r.Deposits is null && r.RateOverride is null && r.Quality is null && r.Manager is null;
            var row = await db.Settings.FindAsync(key);
            if (empty) { if (row is not null) db.Settings.Remove(row); }
            else
            {
                var json = JsonSerializer.Serialize(new PrimInputs(r.Leads, r.Deposits, r.RateOverride, r.Quality, r.Manager), PrimService.Json);
                if (row is null) db.Settings.Add(new AppSetting { Key = key, Value = json });
                else row.Value = json;
            }
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // Yıl özeti: 12 ay
        g.MapGet("/year", async (int year, CrmDbContext db) =>
        {
            var st = await db.Settings.AsNoTracking().ToDictionaryAsync(s => s.Key, s => s.Value);
            var cfg = PrimService.ParseConfig(st.GetValueOrDefault(PrimService.ConfigKey));
            var rev = await RevenueByMonth(db, year);
            var months = Enumerable.Range(1, 12).Select(m =>
            {
                var r = PrimService.Calculate(cfg, rev.GetValueOrDefault(m), Target(st, year, m), PrimService.ParseInputs(st.GetValueOrDefault(PrimService.Key(year, m))));
                return new { month = m, revenue = r.Revenue, points = r.TotalPoints, percent = r.BandPercent, prim = r.Prim, hasData = rev.ContainsKey(m) };
            }).ToList();
            return Results.Ok(new { year, months, totalPrim = months.Sum(x => x.prim), totalRevenue = months.Sum(x => x.revenue) });
        });
    }
}
