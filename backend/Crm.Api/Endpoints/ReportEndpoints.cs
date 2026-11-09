using Crm.Api.Data;
using Crm.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Endpoints;

public static class ReportEndpoints
{
    // Ciro kuralı: İptal edilenler hariç. Tüm tutarlar kayıt anındaki kurla TL'ye çevrilip toplanır.
    // Ciro = Price toplamı, Tahsilat = PaidAmount toplamı.
    // Bu kural değişirse (ör. sadece tamamlananlar) tek yer burası.
    public static void MapReportEndpoints(this WebApplication app)
    {
        app.MapGet("/api/reports/revenue", async (DateTime? from, DateTime? to, CrmDbContext db) =>
        {
            var q = db.Surgeries.AsNoTracking().Where(s => s.Status != SurgeryStatus.Cancelled);
            if (from is not null) q = q.Where(s => s.Date >= from);
            if (to is not null) q = q.Where(s => s.Date <= to);

            var rows = await q.Select(s => new { s.Date, s.Price, s.PaidAmount, s.CommissionRate, s.RateToTry }).ToListAsync();

            var monthly = rows.GroupBy(r => new { r.Date.Year, r.Date.Month })
                .OrderBy(g => g.Key.Year).ThenBy(g => g.Key.Month)
                .Select(g => new
                {
                    Month = $"{g.Key.Year}-{g.Key.Month:00}",
                    Revenue = g.Sum(x => x.Price * x.RateToTry),
                    Collected = g.Sum(x => x.PaidAmount * x.RateToTry),
                    Commission = g.Sum(x => x.Price * x.CommissionRate / 100 * x.RateToTry),
                    Count = g.Count()
                }).ToList();

            var revenue = rows.Sum(r => r.Price * r.RateToTry);
            var collected = rows.Sum(r => r.PaidAmount * r.RateToTry);
            return Results.Ok(new
            {
                Revenue = revenue,
                Collected = collected,
                Outstanding = revenue - collected,
                Commission = rows.Sum(r => r.Price * r.CommissionRate / 100 * r.RateToTry),
                SurgeryCount = rows.Count,
                Monthly = monthly
            });
        });
    }
}
