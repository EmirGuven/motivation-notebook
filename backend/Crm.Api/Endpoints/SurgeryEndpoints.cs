using Crm.Api.Data;
using Crm.Api.Models;
using Crm.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Endpoints;

public record SurgeryInput(int CustomerId, string Title, DateTime Date, decimal Price, decimal PaidAmount, SurgeryStatus Status, string? Notes, decimal CommissionRate = 0, string Currency = "TRY", decimal RateToTry = 0);

public static class SurgeryEndpoints
{
    public static void MapSurgeryEndpoints(this WebApplication app)
    {
        var g = app.MapGroup("/api/surgeries");

        g.MapGet("/", async (DateTime? from, DateTime? to, int? customerId, CrmDbContext db) =>
        {
            var q = db.Surgeries.AsNoTracking().AsQueryable();
            if (from is not null) q = q.Where(s => s.Date >= from);
            if (to is not null) q = q.Where(s => s.Date <= to);
            if (customerId is not null) q = q.Where(s => s.CustomerId == customerId);
            var rows = await q.OrderByDescending(s => s.Date).Select(s => new
            {
                s.Id, s.CustomerId, CustomerName = s.Customer!.FirstName + " " + s.Customer.LastName,
                s.Title, s.Date, s.Price, s.PaidAmount, s.CommissionRate, s.Currency, s.RateToTry, s.Status, s.Notes
            }).ToListAsync();
            // TL karşılıkları ve komisyon, kayıt anındaki kurla hesaplanır.
            return rows.Select(r => new
            {
                r.Id, r.CustomerId, r.CustomerName, r.Title, r.Date, r.Price, r.PaidAmount, r.CommissionRate,
                r.Currency, r.RateToTry, r.Status, r.Notes,
                PriceTry = r.Price * r.RateToTry,
                Commission = r.Price * r.CommissionRate / 100,
                CommissionTry = r.Price * r.CommissionRate / 100 * r.RateToTry
            });
        });

        g.MapPost("/", async (SurgeryInput i, CrmDbContext db, ExchangeRateService fx) =>
        {
            if (!await db.Customers.AnyAsync(c => c.Id == i.CustomerId)) return Results.BadRequest("Müşteri bulunamadı.");
            if (i.CommissionRate is < 0 or > 100) return Results.BadRequest("Komisyon yüzdesi 0-100 arası olmalı.");
            var cur = (i.Currency ?? "TRY").ToUpperInvariant();
            if (!ExchangeRateService.Supported.Any(c => c.Code == cur)) return Results.BadRequest("Desteklenmeyen para birimi.");
            var rate = cur == "TRY" ? 1 : i.RateToTry > 0 ? i.RateToTry : await fx.GetEffectiveRateAsync(cur);
            if (rate is null) return Results.BadRequest($"{cur} kuru alınamadı. Ayarlar'dan manuel kur gir.");
            var s = new Surgery { Currency = cur, RateToTry = rate.Value, CustomerId = i.CustomerId, Title = (i.Title ?? "").Trim(), Date = i.Date, Price = i.Price, PaidAmount = i.PaidAmount, CommissionRate = i.CommissionRate, Status = i.Status, Notes = i.Notes };
            db.Surgeries.Add(s);
            await db.SaveChangesAsync();
            return Results.Created($"/api/surgeries/{s.Id}", s);
        });

        g.MapPut("/{id:int}", async (int id, SurgeryInput i, CrmDbContext db, ExchangeRateService fx) =>
        {
            var s = await db.Surgeries.FindAsync(id);
            if (s is null) return Results.NotFound();
            var cur = (i.Currency ?? "TRY").ToUpperInvariant();
            if (!ExchangeRateService.Supported.Any(c => c.Code == cur)) return Results.BadRequest("Desteklenmeyen para birimi.");
            // Para birimi aynı kaldıysa kayıt anındaki kur korunur; değiştiyse güncel kur uygulanır.
            decimal? rate = cur == "TRY" ? 1
                : i.RateToTry > 0 ? i.RateToTry
                : cur == s.Currency ? s.RateToTry
                : await fx.GetEffectiveRateAsync(cur);
            if (rate is null) return Results.BadRequest($"{cur} kuru alınamadı.");
            s.Currency = cur; s.RateToTry = rate.Value;
            s.Title = (i.Title ?? "").Trim(); s.Date = i.Date; s.Price = i.Price;
            s.PaidAmount = i.PaidAmount; s.CommissionRate = i.CommissionRate; s.Status = i.Status; s.Notes = i.Notes;
            await db.SaveChangesAsync();
            return Results.Ok(s);
        });

        g.MapDelete("/{id:int}", async (int id, CrmDbContext db) =>
        {
            var s = await db.Surgeries.FindAsync(id);
            if (s is null) return Results.NotFound();
            db.Surgeries.Remove(s);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }
}
