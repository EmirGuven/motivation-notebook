using System.Globalization;
using System.Text.Json;
using Crm.Api.Data;
using Crm.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Services;

public record ToolResult(string Json, bool IsError, string? Action = null, bool Changed = false);

// Sohbet asistanının veritabanında yapabildiği işler. Silme bilerek yok.
public class ChatTools(CrmDbContext db, ExchangeRateService fx)
{
    private static readonly JsonSerializerOptions Out = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public async Task<ToolResult> ExecuteAsync(string name, JsonElement input)
    {
        try
        {
            return name switch
            {
                "search_patients" => await SearchPatients(input),
                "add_patient" => await AddPatient(input),
                "update_record" => await UpdateRecord(input),
                "update_patient" => await UpdatePatient(input),
                "add_note" => await AddNote(input),
                "month_summary" => await MonthSummary(input),
                "set_monthly_target" => await SetTarget(input),
                _ => Err($"Bilinmeyen araç: {name}")
            };
        }
        catch (Exception ex)
        {
            return Err($"İşlem başarısız: {ex.Message}");
        }
    }

    // ---- yardımcılar ----
    private static ToolResult Err(string msg) => new(JsonSerializer.Serialize(new { error = msg }), true);
    private static ToolResult Ok(object data, string? action = null, bool changed = false) =>
        new(JsonSerializer.Serialize(data, Out), false, action, changed);

    private static string? Str(JsonElement e, string key) =>
        e.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
    private static decimal? Num(JsonElement e, string key) =>
        e.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDecimal() : null;
    private static int? Int(JsonElement e, string key) =>
        e.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetInt32() : null;
    private static bool TryDate(string? s, out DateTime d) =>
        DateTime.TryParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out d);

    private static object Describe(Customer c) => new
    {
        patientId = c.Id,
        name = $"{c.FirstName} {c.LastName}".Trim(),
        phone = c.Phone, email = c.Email, notes = c.Notes,
        records = c.Surgeries.OrderByDescending(s => s.Date).Select(s => new
        {
            recordId = s.Id, service = s.Title, date = s.Date.ToString("yyyy-MM-dd"),
            amount = s.Price, currency = s.Currency, status = s.Status.ToString(), note = s.Notes
        })
    };

    private static string Full(Customer c) => $"{c.FirstName} {c.LastName}".Trim();

    // ---- araçlar ----
    private async Task<ToolResult> SearchPatients(JsonElement i)
    {
        var q = (Str(i, "query") ?? "").Trim().ToLower();
        var list = await db.Customers.AsNoTracking().Include(c => c.Surgeries)
            .Where(c => q == "" || (c.FirstName + " " + c.LastName).ToLower().Contains(q))
            .OrderBy(c => c.FirstName).Take(15).ToListAsync();
        return Ok(new { count = list.Count, patients = list.Select(Describe) });
    }

    private async Task<ToolResult> AddPatient(JsonElement i)
    {
        var name = Regex(Str(i, "name"));
        if (string.IsNullOrWhiteSpace(name)) return Err("Hasta adı eksik.");
        var service = Str(i, "service")?.Trim() ?? "";
        var amount = Num(i, "amount") ?? 0;
        if (amount < 0) return Err("Tutar negatif olamaz.");
        var date = DateTime.Today;
        if (Str(i, "date") is { } ds && !TryDate(ds, out date)) return Err("Tarih yyyy-MM-dd biçiminde olmalı.");

        var currency = (Str(i, "currency") ?? await DefaultCurrency()).ToUpperInvariant();
        if (!ExchangeRateService.Supported.Any(c => c.Code == currency)) return Err($"Desteklenmeyen para birimi: {currency}");
        var rate = await fx.GetEffectiveRateAsync(currency);
        if (rate is null) return Err($"{currency} kuru alınamadı. Ayarlar'dan manuel kur girilmeli.");

        var parts = name.Split(' ');
        var last = parts.Length > 1 ? parts[^1] : ".";
        var first = parts.Length > 1 ? string.Join(' ', parts[..^1]) : name;
        var customer = await db.Customers.FirstOrDefaultAsync(c =>
            (c.FirstName + " " + c.LastName).ToLower() == (first + " " + last).ToLower());
        var isNew = customer is null;
        customer ??= db.Customers.Add(new Customer { FirstName = first, LastName = last }).Entity;

        var s = new Surgery
        {
            Customer = customer, Title = service, Date = date, Price = amount, PaidAmount = amount,
            Currency = currency, RateToTry = rate.Value, Status = SurgeryStatus.Planned
        };
        db.Surgeries.Add(s);
        await db.SaveChangesAsync();
        return Ok(new { ok = true, patientId = customer.Id, recordId = s.Id, newPatient = isNew, amountTry = s.Price * s.RateToTry },
            $"Hasta kaydedildi: {Full(customer)} — {(service == "" ? "hizmet yok" : service)}, {date:dd.MM.yyyy}, {amount:N0} {currency}", true);
    }

    private async Task<ToolResult> UpdateRecord(JsonElement i)
    {
        var id = Int(i, "record_id");
        var s = id is null ? null : await db.Surgeries.Include(x => x.Customer).FirstOrDefaultAsync(x => x.Id == id);
        if (s is null) return Err("Kayıt bulunamadı. Önce search_patients ile recordId bul.");

        var changes = new List<string>();
        if (Str(i, "service") is { } svc && svc.Trim() != "") { s.Title = svc.Trim(); changes.Add($"hizmet: {s.Title}"); }
        if (Str(i, "date") is { } ds) { if (!TryDate(ds, out var d)) return Err("Tarih yyyy-MM-dd olmalı."); s.Date = d; changes.Add($"tarih: {d:dd.MM.yyyy}"); }
        if (Num(i, "amount") is { } amt)
        {
            if (amt < 0) return Err("Tutar negatif olamaz.");
            s.Price = amt; s.PaidAmount = amt; changes.Add($"tutar: {amt:N0} {s.Currency}");
        }
        if (Str(i, "currency") is { } cur)
        {
            cur = cur.ToUpperInvariant();
            if (!ExchangeRateService.Supported.Any(c => c.Code == cur)) return Err($"Desteklenmeyen para birimi: {cur}");
            var rate = await fx.GetEffectiveRateAsync(cur);
            if (rate is null) return Err($"{cur} kuru alınamadı.");
            s.Currency = cur; s.RateToTry = rate.Value; changes.Add($"para birimi: {cur}");
        }
        if (Str(i, "status") is { } st)
        {
            if (!Enum.TryParse<SurgeryStatus>(st, true, out var status)) return Err("Durum Planned, Completed veya Cancelled olmalı.");
            s.Status = status; changes.Add($"durum: {status}");
        }
        if (Str(i, "note") is { } note) { s.Notes = note; changes.Add("not"); }
        if (changes.Count == 0) return Err("Değiştirilecek bir alan verilmedi.");
        await db.SaveChangesAsync();
        return Ok(new { ok = true, recordId = s.Id, changed = changes },
            $"Kayıt güncellendi: {Full(s.Customer!)} — {string.Join(", ", changes)}", true);
    }

    private async Task<ToolResult> UpdatePatient(JsonElement i)
    {
        var id = Int(i, "patient_id");
        var c = id is null ? null : await db.Customers.FindAsync(id);
        if (c is null) return Err("Hasta bulunamadı. Önce search_patients ile patientId bul.");
        var changes = new List<string>();
        if (Regex(Str(i, "name")) is { Length: > 0 } nm)
        {
            var parts = nm.Split(' ');
            c.LastName = parts.Length > 1 ? parts[^1] : ".";
            c.FirstName = parts.Length > 1 ? string.Join(' ', parts[..^1]) : nm;
            changes.Add($"ad: {Full(c)}");
        }
        if (Str(i, "phone") is { } ph) { c.Phone = ph; changes.Add($"telefon: {ph}"); }
        if (Str(i, "email") is { } em) { c.Email = em; changes.Add($"e-posta: {em}"); }
        if (changes.Count == 0) return Err("Değiştirilecek bir alan verilmedi.");
        await db.SaveChangesAsync();
        return Ok(new { ok = true, changed = changes }, $"Hasta güncellendi: {Full(c)} — {string.Join(", ", changes)}", true);
    }

    private async Task<ToolResult> AddNote(JsonElement i)
    {
        var id = Int(i, "patient_id");
        var text = Str(i, "note")?.Trim();
        var c = id is null ? null : await db.Customers.FindAsync(id);
        if (c is null) return Err("Hasta bulunamadı. Önce search_patients ile patientId bul.");
        if (string.IsNullOrEmpty(text)) return Err("Not boş olamaz.");
        var line = $"[{DateTime.Now:dd.MM.yyyy}] {text}";
        c.Notes = string.IsNullOrWhiteSpace(c.Notes) ? line : c.Notes + "\n" + line;
        await db.SaveChangesAsync();
        return Ok(new { ok = true }, $"Not eklendi: {Full(c)} — {text}", true);
    }

    private async Task<ToolResult> MonthSummary(JsonElement i)
    {
        var year = Int(i, "year") ?? DateTime.Now.Year;
        var month = Int(i, "month") ?? DateTime.Now.Month;
        if (month is < 1 or > 12) return Err("Ay 1-12 arası olmalı.");
        var from = new DateTime(year, month, 1);
        var to = from.AddMonths(1);
        var rows = await db.Surgeries.AsNoTracking().Include(s => s.Customer)
            .Where(s => s.Date >= from && s.Date < to && s.Status != SurgeryStatus.Cancelled).ToListAsync();
        var revenue = rows.Sum(s => s.Price * s.RateToTry);
        var t = await db.Settings.FindAsync($"Target:{year}-{month:00}");
        decimal? target = t is not null && decimal.TryParse(t.Value, NumberStyles.Any, CultureInfo.InvariantCulture, out var d) ? d : null;
        return Ok(new
        {
            year, month, patientCount = rows.Count, revenueTry = revenue, targetTry = target,
            remainingTry = target is null ? (decimal?)null : target - revenue,
            commissionTry = new Dictionary<string, decimal> { ["1%"] = revenue * 0.01m, ["2%"] = revenue * 0.02m, ["3%"] = revenue * 0.03m, ["4%"] = revenue * 0.04m, ["5%"] = revenue * 0.05m },
            records = rows.OrderBy(s => s.Date).Select(s => new { patient = Full(s.Customer!), service = s.Title, date = s.Date.ToString("yyyy-MM-dd"), amount = s.Price, currency = s.Currency })
        });
    }

    private async Task<ToolResult> SetTarget(JsonElement i)
    {
        var year = Int(i, "year") ?? DateTime.Now.Year;
        var month = Int(i, "month");
        var amount = Num(i, "amount");
        if (month is null or < 1 or > 12) return Err("Ay 1-12 arası olmalı.");
        if (amount is null or < 0) return Err("Hedef tutarı eksik.");
        var key = $"Target:{year}-{month:00}";
        var row = await db.Settings.FindAsync(key);
        if (amount == 0) { if (row is not null) db.Settings.Remove(row); }
        else if (row is null) db.Settings.Add(new AppSetting { Key = key, Value = amount.Value.ToString(CultureInfo.InvariantCulture) });
        else row.Value = amount.Value.ToString(CultureInfo.InvariantCulture);
        await db.SaveChangesAsync();
        return Ok(new { ok = true }, $"{month}/{year} hedefi: {amount:N0} ₺", true);
    }

    private async Task<string> DefaultCurrency() =>
        (await db.Settings.FindAsync("DefaultCurrency"))?.Value ?? "TRY";

    private static string Regex(string? s) =>
        System.Text.RegularExpressions.Regex.Replace((s ?? "").Trim(), @"\s+", " ");
}
