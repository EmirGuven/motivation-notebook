using System.Globalization;
using Crm.Api.Data;
using Crm.Api.Models;
using Crm.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Endpoints;

public record SettingsInput(string RateMode, string DefaultCurrency, Dictionary<string, decimal?> ManualRates);

public static class SettingsEndpoints
{
    public static void MapSettingsEndpoints(this WebApplication app)
    {
        app.MapGet("/api/settings", async (ExchangeRateService fx, bool? refresh) =>
        {
            var st = await fx.GetSettingsAsync();
            var auto = await fx.GetAutoRatesAsync(refresh == true);
            var currencies = new List<object>();
            foreach (var c in ExchangeRateService.Supported)
            {
                var a = auto.Auto.GetValueOrDefault(c.Code);
                currencies.Add(new
                {
                    c.Code, c.Name,
                    AutoRate = c.Code == "TRY" ? 1 : (decimal?)(a > 0 ? a : null),
                    ManualRate = c.Code == "TRY" ? null : ExchangeRateService.ParseManual(st, c.Code),
                    EffectiveRate = await fx.GetEffectiveRateAsync(c.Code)
                });
            }
            return Results.Ok(new
            {
                RateMode = st.GetValueOrDefault("RateMode", "Auto"),
                DefaultCurrency = st.GetValueOrDefault("DefaultCurrency", "TRY"),
                RateDate = auto.Date,
                Currencies = currencies
            });
        });

        app.MapPut("/api/settings", async (SettingsInput i, CrmDbContext db) =>
        {
            if (i.RateMode is not ("Auto" or "Manual")) return Results.BadRequest("Geçersiz kur modu.");
            if (!ExchangeRateService.Supported.Any(c => c.Code == i.DefaultCurrency)) return Results.BadRequest("Geçersiz para birimi.");

            async Task Set(string key, string? value)
            {
                var row = await db.Settings.FindAsync(key);
                if (value is null) { if (row is not null) db.Settings.Remove(row); return; }
                if (row is null) db.Settings.Add(new AppSetting { Key = key, Value = value });
                else row.Value = value;
            }

            await Set("RateMode", i.RateMode);
            await Set("DefaultCurrency", i.DefaultCurrency);
            foreach (var c in ExchangeRateService.Supported.Where(c => c.Code != "TRY"))
            {
                i.ManualRates.TryGetValue(c.Code, out var v);
                await Set($"Manual:{c.Code}", v is > 0 ? v.Value.ToString(CultureInfo.InvariantCulture) : null);
            }
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }
}
