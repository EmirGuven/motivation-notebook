using Crm.Api.Data;
using Crm.Api.Models;

namespace Crm.Api.Endpoints;

public record LogoInput(string DataUrl);

public static class LogoEndpoints
{
    const string Key = "Logo";
    const int MaxLength = 1_000_000; // data URL uzunluğu; istemci zaten küçültüp gönderir

    public static void MapLogoEndpoints(this WebApplication app)
    {
        app.MapGet("/api/logo", async (CrmDbContext db) =>
            Results.Ok(new { DataUrl = (await db.Settings.FindAsync(Key))?.Value }));

        app.MapPut("/api/logo", async (LogoInput i, CrmDbContext db) =>
        {
            if (!i.DataUrl.StartsWith("data:image/") || i.DataUrl.Length > MaxLength)
                return Results.BadRequest("Geçersiz veya çok büyük görsel.");
            var row = await db.Settings.FindAsync(Key);
            if (row is null) db.Settings.Add(new AppSetting { Key = Key, Value = i.DataUrl });
            else row.Value = i.DataUrl;
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        app.MapDelete("/api/logo", async (CrmDbContext db) =>
        {
            var row = await db.Settings.FindAsync(Key);
            if (row is not null) { db.Settings.Remove(row); await db.SaveChangesAsync(); }
            return Results.NoContent();
        });
    }
}
