using System.Globalization;
using Crm.Api.Data;
using Crm.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Endpoints;

public record TargetsInput(int Year, decimal?[] Months);

// Ay ay ciro hedefi (₺). "Target:YYYY-MM" anahtarlarıyla Settings tablosunda tutulur.
public static class TargetEndpoints
{
    public static void MapTargetEndpoints(this WebApplication app)
    {
        app.MapGet("/api/targets", async (int year, CrmDbContext db) =>
        {
            var prefix = $"Target:{year}-";
            var rows = await db.Settings.AsNoTracking().Where(s => s.Key.StartsWith(prefix)).ToListAsync();
            var months = new decimal?[12];
            foreach (var r in rows)
            {
                if (int.TryParse(r.Key[prefix.Length..], out var m) && m is >= 1 and <= 12
                    && decimal.TryParse(r.Value, NumberStyles.Any, CultureInfo.InvariantCulture, out var d) && d > 0)
                    months[m - 1] = d;
            }
            return Results.Ok(new { Year = year, Months = months });
        });

        app.MapPut("/api/targets", async (TargetsInput i, CrmDbContext db) =>
        {
            if (i.Months.Length != 12) return Results.BadRequest("12 aylık hedef gerekli.");
            for (var m = 1; m <= 12; m++)
            {
                var key = $"Target:{i.Year}-{m:00}";
                var v = i.Months[m - 1];
                var row = await db.Settings.FindAsync(key);
                if (v is > 0)
                {
                    var text = v.Value.ToString(CultureInfo.InvariantCulture);
                    if (row is null) db.Settings.Add(new AppSetting { Key = key, Value = text });
                    else row.Value = text;
                }
                else if (row is not null) db.Settings.Remove(row);
            }
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }
}
