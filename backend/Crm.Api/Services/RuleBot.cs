using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Crm.Api.Data;
using Crm.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Services;

// API anahtarı olmadan çalışan basit komut anlayıcı. Yapay zekâ değil: bilinen cümle kalıplarını
// (kaydet / not al / düzelt / ne kadar ciro) kurallarla çözer. Anlamazsa örnek gösterir.
public class RuleBot(CrmDbContext db, ChatTools tools)
{
    private static readonly CultureInfo Tr = new("tr-TR");
    private static readonly string[] MonthNames = ["ocak", "subat", "mart", "nisan", "mayis", "haziran", "temmuz", "agustos", "eylul", "ekim", "kasim", "aralik"];
    private static readonly string[] MonthTr = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

    private const string Help = """
        Yapay zekâ anahtarı olmadan basit modda çalışıyorum; şu kalıpları anlarım:

        • Ayşe Yılmaz saç ekimi 14 Kasım 50000 TL kaydet
        • Ayşe Yılmaz'a telefonu açmıyor notunu al
        • Ayşe Yılmaz'ın tarihini 25 Kasım yap
        • Ayşe Yılmaz'ın tutarını 60000 yap  (hizmetini …  yap, telefonunu …  yap, iptal et)
        • Bu ay ne kadar ciro yaptım? (Kasım, geçen ay…)

        Virgülle ayırırsan daha net olur: "Ali Veli, burun estetiği, 3 Aralık, 4000 EUR".
        """;

    // Türkçe harfleri sadeleştirip küçültür; uzunluğu değiştirmez (indeksler orijinal metinle aynı kalır).
    private static string Fold(string s)
    {
        var sb = new StringBuilder(s.Length);
        foreach (var ch in s)
            sb.Append(ch switch
            {
                'ç' or 'Ç' => 'c', 'ğ' or 'Ğ' => 'g', 'ı' or 'I' or 'İ' => 'i', 'ö' or 'Ö' => 'o',
                'ş' or 'Ş' => 's', 'ü' or 'Ü' => 'u', '’' => '\'', _ => char.ToLowerInvariant(ch)
            });
        return sb.ToString();
    }

    public async Task<ChatReply> RunAsync(string message)
    {
        var text = message.Trim();
        var f = Fold(text);
        var actions = new List<string>();
        var changed = false;

        if (f.Length == 0 || Regex.IsMatch(f, @"^(merhaba|selam|yardim|ne yapabilirsin|help)\b") && f.Length < 40)
            return new ChatReply(Help, actions, false);

        // Hasta adı geçiyorsa düzeltme/not işleri; yoksa özet veya yeni kayıt.
        var (patient, nameEnd, ambiguous) = await FindPatient(text, f);
        if (ambiguous is not null)
            return new ChatReply($"Birden fazla hasta eşleşti: {ambiguous}. Soyadıyla birlikte yazar mısın?", actions, false);

        if (patient is not null && Regex.IsMatch(f, @"\bnot\b|\bnotu|\bnotunu"))
            return await AddNote(patient, text, nameEnd);

        if (patient is not null && Regex.IsMatch(f, @"\b(yap|duzelt\w*|degistir\w*|guncelle\w*|olsun|iptal|tamamlandi)\b"))
        {
            var r = await Update(patient, text, f);
            if (r is not null) return r;
        }

        if (Regex.IsMatch(f, @"\b(ciro|kazanc|komisyon|hedef|kac hasta|ne kadar)\w*") && !Regex.IsMatch(f, @"\b(kaydet|ekle)\b"))
            return await Summary(f);

        if (Regex.IsMatch(f, @"\b(kaydet|ekle|kaydedelim|yaz|geldi|gelecek)\b") || text.Contains(','))
            return await AddPatient(text, f);

        return new ChatReply("Bunu anlayamadım.\n\n" + Help, actions, changed);
    }

    // ---- hasta bulma ----
    private async Task<(Customer? patient, int nameEnd, string? ambiguous)> FindPatient(string text, string f)
    {
        var all = await db.Customers.AsNoTracking().ToListAsync();
        Customer? best = null; var bestEnd = 0; var bestLen = 0;

        foreach (var c in all)
        {
            var full = Fold($"{c.FirstName} {c.LastName}".Trim());
            if (full.Length < 3) continue;
            var end = MatchWord(f, full);
            if (end >= 0 && full.Length > bestLen) { best = c; bestEnd = end; bestLen = full.Length; }
        }
        if (best is not null) return (best, bestEnd, null);

        // Sadece ad söylendiyse: tek eşleşme varsa onu al
        var firstHits = new List<(Customer c, int end)>();
        foreach (var c in all)
        {
            var first = Fold(c.FirstName.Trim());
            if (first.Length < 3) continue;
            var end = MatchWord(f, first);
            if (end >= 0) firstHits.Add((c, end));
        }
        if (firstHits.Count == 1) return (firstHits[0].c, firstHits[0].end, null);
        if (firstHits.Count > 1)
            return (null, 0, string.Join(", ", firstHits.Select(h => $"{h.c.FirstName} {h.c.LastName}".Trim())));
        return (null, 0, null);
    }

    // `needle` metinde kelime başında geçiyor mu; sonuna en çok 4 harflik ek (Ali'ye, Alinin) kabul eder. Bitiş indeksini döner.
    private static int MatchWord(string f, string needle)
    {
        var from = 0;
        while (true)
        {
            var i = f.IndexOf(needle, from, StringComparison.Ordinal);
            if (i < 0) return -1;
            var before = i == 0 || !char.IsLetterOrDigit(f[i - 1]);
            var end = i + needle.Length;
            var j = end;
            if (j < f.Length && f[j] == '\'') j++;
            var k = j; while (k < f.Length && char.IsLetter(f[k])) k++;
            var suffixOk = k - j <= 4 && (k >= f.Length || !char.IsLetterOrDigit(f[k]));
            if (before && suffixOk) return k;
            from = i + 1;
        }
    }

    // ---- not al ----
    private async Task<ChatReply> AddNote(Customer p, string text, int nameEnd)
    {
        var rest = text[Math.Min(nameEnd, text.Length)..];
        rest = Regex.Replace(rest, @"\bnot(?:unu|u|lar[ıi]|un)?\s*(?:al|ekle|yaz|düş)\w*\s*[:\-]?", " ", RegexOptions.IgnoreCase);
        rest = Regex.Replace(rest, @"\b(?:diye|şeklinde)\b", " ", RegexOptions.IgnoreCase);
        rest = rest.Trim(' ', '"', '“', '”', '\'', '’', ':', '-', ',', '.').Trim();
        rest = Regex.Replace(rest, @"\s+", " ");
        if (rest.Length == 0)
            return new ChatReply($"{Name(p)} için notu yazmadın. Örn: \"{Name(p)}'a telefonu açmıyor notunu al\"", [], false);
        return await Run("add_note", new { patient_id = p.Id, note = rest });
    }

    // ---- düzeltme ----
    private async Task<ChatReply?> Update(Customer p, string text, string f)
    {
        var record = await db.Surgeries.AsNoTracking().Where(s => s.CustomerId == p.Id)
            .OrderByDescending(s => s.Date).ThenByDescending(s => s.Id).FirstOrDefaultAsync();
        var count = await db.Surgeries.CountAsync(s => s.CustomerId == p.Id);
        var which = count > 1 ? $" (en güncel kaydı: {record!.Date:dd.MM.yyyy}; farklı kayıt için Düzenle'yi kullan)" : "";

        if (Regex.IsMatch(f, @"\b(telefon\w*|numara\w*)\b"))
        {
            var m = Regex.Match(text, @"\+?\d[\d\s\-()]{8,}\d");
            if (!m.Success) return new ChatReply("Telefon numarasını yazmadın.", [], false);
            return await Run("update_patient", new { patient_id = p.Id, phone = m.Value.Trim() });
        }
        if (Regex.IsMatch(f, @"\b(adin\w*|ismin\w*|soyadin\w*)\b"))
        {
            var m = Regex.Match(text, @"(?:adını|ismini|adi|ismi)\s+(.+?)\s+(?:yap|olsun|düzelt|değiştir)\w*", RegexOptions.IgnoreCase);
            if (!m.Success) return new ChatReply("Yeni adı yazmadın. Örn: \"Ali'nin adını Ali Veli yap\"", [], false);
            return await Run("update_patient", new { patient_id = p.Id, name = m.Groups[1].Value.Trim() });
        }

        if (record is null) return new ChatReply($"{Name(p)} için kayıt yok; önce kaydetmem gerekir.", [], false);

        if (Regex.IsMatch(f, @"\biptal\b"))
            return await Run("update_record", new { record_id = record.Id, status = "Cancelled" }, which);
        if (Regex.IsMatch(f, @"\btamamlandi\b"))
            return await Run("update_record", new { record_id = record.Id, status = "Completed" }, which);

        if (Regex.IsMatch(f, @"\b(hizmet\w*)\b"))
        {
            var m = Regex.Match(text, @"hizmet\w*\s+(.+?)\s+(?:yap|olsun|olarak|düzelt|değiştir)\w*", RegexOptions.IgnoreCase);
            if (!m.Success) return new ChatReply("Yeni hizmeti yazmadın. Örn: \"Ali'nin hizmetini diş yap\"", [], false);
            return await Run("update_record", new { record_id = record.Id, service = m.Groups[1].Value.Trim() }, which);
        }
        if (Regex.IsMatch(f, @"\b(tarih\w*|gun\w*)\b"))
        {
            var d = ParseDate(f);
            if (d is null) return new ChatReply("Tarihi anlayamadım. Örn: \"25 Kasım\" ya da \"25.11.2026\"", [], false);
            return await Run("update_record", new { record_id = record.Id, date = d.Value.ToString("yyyy-MM-dd") }, which);
        }
        if (Regex.IsMatch(f, @"\b(tutar\w*|ciro\w*|fiyat\w*|ucret\w*|para\w*)\b"))
        {
            var (amount, cur) = ParseAmount(StripDate(f));
            if (amount is null) return new ChatReply("Tutarı anlayamadım. Örn: \"tutarını 60000 yap\"", [], false);
            return await Run("update_record", cur is null
                ? new { record_id = record.Id, amount = amount.Value, currency = (string?)null }
                : new { record_id = record.Id, amount = amount.Value, currency = (string?)cur }, which);
        }
        return null;
    }

    // ---- özet ----
    private async Task<ChatReply> Summary(string f)
    {
        var now = DateTime.Today;
        var month = now.Month; var year = now.Year;
        if (Regex.IsMatch(f, @"\bgecen ay\b")) { var d = now.AddMonths(-1); month = d.Month; year = d.Year; }
        else if (Regex.IsMatch(f, @"\b(gelecek|haftaya|onumuzdeki) ay\b")) { var d = now.AddMonths(1); month = d.Month; year = d.Year; }
        else
            for (var i = 0; i < 12; i++)
                if (Regex.IsMatch(f, $@"\b{MonthNames[i]}\w*")) { month = i + 1; break; }
        var ym = Regex.Match(f, @"\b(20\d{2})\b");
        if (ym.Success) year = int.Parse(ym.Value);

        var r = await tools.ExecuteAsync("month_summary", JsonSerializer.SerializeToElement(new { year, month }));
        using var doc = JsonDocument.Parse(r.Json);
        var root = doc.RootElement;
        var revenue = root.GetProperty("revenueTry").GetDecimal();
        var sb = new StringBuilder();
        sb.AppendLine($"{MonthTr[month - 1]} {year}: {root.GetProperty("patientCount").GetInt32()} hasta, ciro {Money(revenue)}.");
        if (root.GetProperty("targetTry").ValueKind == JsonValueKind.Number)
        {
            var target = root.GetProperty("targetTry").GetDecimal();
            sb.AppendLine(revenue >= target
                ? $"Hedef {Money(target)} — aşıldı (+{Money(revenue - target)})."
                : $"Hedef {Money(target)} — kalan {Money(target - revenue)}.");
        }
        sb.Append("Komisyon: " + string.Join("  ", Enumerable.Range(1, 5).Select(p => $"%{p}: {Money(revenue * p / 100)}")));
        return new ChatReply(sb.ToString(), [], false);
    }

    // ---- yeni hasta ----
    private async Task<ChatReply> AddPatient(string text, string f)
    {
        var (amount, cur) = ParseAmount(StripDate(f));
        var date = ParseDate(f);

        string name, service;
        if (text.Contains(','))
        {
            var parts = text.Split(',').Select(x => x.Trim()).Where(x => x.Length > 0).ToList();
            name = Regex.Replace(parts[0], @"\b(kaydet|ekle)\b", "", RegexOptions.IgnoreCase).Trim();
            service = parts.Skip(1).FirstOrDefault(p => !LooksLikeDateOrAmount(p)) ?? "";
        }
        else
        {
            // Tarih, tutar, para birimi ve fiil kelimelerini at; kalanı "ad [soyad] hizmet" say.
            var rest = StripDateOriginal(text);
            rest = Regex.Replace(rest, @"\d[\d.,]*\s*(?:bin|k)?\s*(?:tl|₺|lira|usd|dolar|\$|eur|euro|€|gbp|sterlin|£|chf|frank)?", " ", RegexOptions.IgnoreCase);
            rest = Regex.Replace(rest, @"\b(kaydet|kaydedelim|ekle|yaz|geldi|gelecek|tarihinde|tarihine|için|icin|ciro|ile)\b", " ", RegexOptions.IgnoreCase);
            var words = rest.Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(w => w.Trim(',', '.', ':')).Where(w => w.Length > 0).ToList();

            var known = await db.Surgeries.AsNoTracking().Select(s => s.Title).Where(t => t != "").Distinct().ToListAsync();
            var joined = string.Join(' ', words);
            var svc = known.OrderByDescending(k => k.Length).FirstOrDefault(k => Fold(joined).Contains(Fold(k)));
            if (svc is not null)
            {
                var idx = Fold(joined).IndexOf(Fold(svc), StringComparison.Ordinal);
                name = (joined[..idx] + " " + joined[(idx + svc.Length)..]).Trim();
                service = svc;
            }
            else
            {
                name = string.Join(' ', words.Take(2));
                service = string.Join(' ', words.Skip(2));
            }
        }
        name = Regex.Replace(name, @"\s+", " ").Trim();
        if (name.Length == 0)
            return new ChatReply("Hasta adını anlayamadım. Örn: \"Ayşe Yılmaz saç ekimi 14 Kasım 50000 TL kaydet\"", [], false);

        var input = new Dictionary<string, object?> { ["name"] = name, ["service"] = service };
        if (date is not null) input["date"] = date.Value.ToString("yyyy-MM-dd");
        if (amount is not null) input["amount"] = amount.Value;
        if (cur is not null) input["currency"] = cur;

        var missing = new List<string>();
        if (service.Length == 0) missing.Add("hizmet");
        if (date is null) missing.Add("tarih (bugün yazıldı)");
        if (amount is null) missing.Add("tutar (0 yazıldı)");
        return await Run("add_patient", input, missing.Count > 0 ? $"\nEksik: {string.Join(", ", missing)}. Kayıt listesinden Düzenle ile tamamlayabilirsin." : "");
    }

    // ---- ortak ----
    private async Task<ChatReply> Run(string tool, object input, string suffix = "")
    {
        var r = await tools.ExecuteAsync(tool, JsonSerializer.SerializeToElement(input));
        if (r.IsError)
        {
            using var doc = JsonDocument.Parse(r.Json);
            return new ChatReply(doc.RootElement.GetProperty("error").GetString() ?? "Hata.", [], false);
        }
        return new ChatReply((r.Action ?? "Tamam.") + suffix, r.Action is null ? [] : [r.Action], r.Changed);
    }

    private static string Name(Customer c) => $"{c.FirstName} {c.LastName}".Trim();
    private static string Money(decimal d) => d.ToString("N0", Tr) + " ₺";

    private static bool LooksLikeDateOrAmount(string s) =>
        ParseDate(Fold(s)) is not null || Regex.IsMatch(s, @"^\d[\d.,]*\s*\p{L}*$");

    // 14 kasım [2026] | 14.11[.2026] | bugün | yarın | öbür gün | dün
    private static readonly Regex DateWords = new(@"\b(\d{1,2})\s+(ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)\w*(?:\s+(20\d{2}))?", RegexOptions.Compiled);
    private static readonly Regex DateNum = new(@"\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b", RegexOptions.Compiled);

    private static DateTime? ParseDate(string f)
    {
        var today = DateTime.Today;
        var m = DateWords.Match(f);
        try
        {
            if (m.Success)
            {
                var y = m.Groups[3].Success ? int.Parse(m.Groups[3].Value) : today.Year;
                return new DateTime(y, Array.IndexOf(MonthNames, m.Groups[2].Value) + 1, int.Parse(m.Groups[1].Value));
            }
            m = DateNum.Match(f);
            if (m.Success)
            {
                var y = m.Groups[3].Success ? int.Parse(m.Groups[3].Value) : today.Year;
                if (y < 100) y += 2000;
                return new DateTime(y, int.Parse(m.Groups[2].Value), int.Parse(m.Groups[1].Value));
            }
        }
        catch (ArgumentOutOfRangeException) { return null; }
        if (Regex.IsMatch(f, @"\bobur gun\b|\bertesi gun\b")) return today.AddDays(2);
        if (Regex.IsMatch(f, @"\byarin\b")) return today.AddDays(1);
        if (Regex.IsMatch(f, @"\bbugun\b")) return today;
        if (Regex.IsMatch(f, @"\bdun\b")) return today.AddDays(-1);
        return null;
    }

    private static string StripDate(string f) => DateNum.Replace(DateWords.Replace(f, " "), " ");
    // Fold uzunluğu korur: tarih eşleşmelerinin yerini orijinal metinde de boşlukla doldurur.
    private static string StripDateOriginal(string text)
    {
        var f = Fold(text);
        var chars = text.ToCharArray();
        foreach (var rx in new[] { DateWords, DateNum })
            foreach (Match m in rx.Matches(f))
                for (var i = m.Index; i < m.Index + m.Length; i++) chars[i] = ' ';
        return new string(chars);
    }

    private static (decimal? amount, string? currency) ParseAmount(string f)
    {
        var ms = Regex.Matches(f, @"(\d[\d.,]*)\s*(bin|k)?\s*(tl|₺|lira|usd|dolar|\$|eur|euro|€|gbp|sterlin|£|chf|frank)?\b");
        (decimal v, string? c)? best = null;
        foreach (Match m in ms)
        {
            var raw = m.Groups[1].Value.TrimEnd('.', ',');
            if (Regex.IsMatch(raw, @"^\d{1,3}(\.\d{3})+$")) raw = raw.Replace(".", "");
            else raw = raw.Replace(",", ".");
            if (!decimal.TryParse(raw, NumberStyles.Any, CultureInfo.InvariantCulture, out var v)) continue;
            if (m.Groups[2].Success) v *= 1000;
            var c = m.Groups[3].Success ? CurrencyCode(m.Groups[3].Value) : null;
            if (c is not null || best is null || (best.Value.c is null && v > best.Value.v)) best = (v, c ?? best?.c);
            if (c is not null) break;
        }
        return best is null ? (null, null) : (best.Value.v, best.Value.c is "TRY" ? "TRY" : best.Value.c);
    }

    private static string? CurrencyCode(string w) => w switch
    {
        "tl" or "₺" or "lira" => "TRY", "usd" or "dolar" or "$" => "USD", "eur" or "euro" or "€" => "EUR",
        "gbp" or "sterlin" or "£" => "GBP", "chf" or "frank" => "CHF", _ => null
    };
}
