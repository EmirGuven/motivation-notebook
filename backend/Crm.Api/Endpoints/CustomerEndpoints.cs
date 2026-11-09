using Crm.Api.Data;
using Crm.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Endpoints;

public record CustomerInput(string FirstName, string LastName, string? Phone, string? Email, string? Notes);

public static class CustomerEndpoints
{
    public static void MapCustomerEndpoints(this WebApplication app)
    {
        var g = app.MapGroup("/api/customers");

        g.MapGet("/", async (string? q, CrmDbContext db) =>
        {
            var query = db.Customers.AsNoTracking().AsQueryable();
            if (!string.IsNullOrWhiteSpace(q))
            {
                var s = q.Trim().ToLower();
                query = query.Where(c => (c.FirstName + " " + c.LastName).ToLower().Contains(s)
                    || (c.Phone != null && c.Phone.Contains(s)));
            }
            var rows = await query.OrderBy(c => c.FirstName).ThenBy(c => c.LastName)
                .Select(c => new
                {
                    c.Id, c.FirstName, c.LastName, c.Phone, c.Email, c.Notes, c.CreatedAt,
                    Items = c.Surgeries.Select(s => new { s.Price, s.RateToTry, s.Status }).ToList()
                }).ToListAsync();
            // Toplam tutar TL cinsinden (kayıt anındaki kurla), iptaller hariç.
            return rows.Select(c => new
            {
                c.Id, c.FirstName, c.LastName, c.Phone, c.Email, c.Notes, c.CreatedAt,
                SurgeryCount = c.Items.Count,
                TotalPrice = c.Items.Where(i => i.Status != SurgeryStatus.Cancelled).Sum(i => i.Price * i.RateToTry)
            });
        });

        g.MapGet("/{id:int}", async (int id, CrmDbContext db) =>
            await db.Customers.AsNoTracking().Include(c => c.Surgeries.OrderByDescending(s => s.Date))
                .FirstOrDefaultAsync(c => c.Id == id) is { } c ? Results.Ok(c) : Results.NotFound());

        g.MapPost("/", async (CustomerInput i, CrmDbContext db) =>
        {
            var c = new Customer { FirstName = (i.FirstName ?? "").Trim(), LastName = (i.LastName ?? "").Trim(), Phone = i.Phone, Email = i.Email, Notes = i.Notes };
            db.Customers.Add(c);
            await db.SaveChangesAsync();
            return Results.Created($"/api/customers/{c.Id}", c);
        });

        g.MapPut("/{id:int}", async (int id, CustomerInput i, CrmDbContext db) =>
        {
            var c = await db.Customers.FindAsync(id);
            if (c is null) return Results.NotFound();
            c.FirstName = (i.FirstName ?? "").Trim(); c.LastName = (i.LastName ?? "").Trim();
            c.Phone = i.Phone; c.Email = i.Email; c.Notes = i.Notes;
            await db.SaveChangesAsync();
            return Results.Ok(c);
        });

        g.MapDelete("/{id:int}", async (int id, CrmDbContext db) =>
        {
            var c = await db.Customers.FindAsync(id);
            if (c is null) return Results.NotFound();
            db.Customers.Remove(c);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }
}
