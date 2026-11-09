using System.Globalization;
using System.Xml.Linq;
using Crm.Api.Data;
using Crm.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Services;

public record CurrencyInfo(string Code, string Name);

public record RateSnapshot(Dictionary<string, decimal> Auto, string? Date);

public class ExchangeRateService(IHttpClientFactory http, CrmDbContext db, ILogger<ExchangeRateService> log)
{
    public static readonly CurrencyInfo[] Supported =
    [
        new("TRY", "Türk Lirası"), new("USD", "ABD Doları"), new("EUR", "Euro"),
        new("GBP", "İngiliz Sterlini"), new("CHF", "İsviçre Frankı"),
    ];

    // TCMB günlük kurları: 1 birim yabancı para = kaç TL (döviz satış). 1 saat önbellek.
    private static RateSnapshot? _cache;
    private static DateTime _cachedAt;
    private static readonly SemaphoreSlim _lock = new(1, 1);

    public async Task<RateSnapshot> GetAutoRatesAsync(bool force = false)
    {
        if (!force && _cache is not null && DateTime.UtcNow - _cachedAt < TimeSpan.FromHours(1)) return _cache;
        await _lock.WaitAsync();
        try
        {
            if (!force && _cache is not null && DateTime.UtcNow - _cachedAt < TimeSpan.FromHours(1)) return _cache;
            try
            {
                var xml = await http.CreateClient().GetStringAsync("https://www.tcmb.gov.tr/kurlar/today.xml");
                var doc = XDocument.Parse(xml);
                var rates = new Dictionary<string, decimal>();
                foreach (var c in doc.Descendants("Currency"))
                {
                    var code = (string?)c.Attribute("Kod");
                    var sell = (string?)c.Element("ForexSelling");
                    var unit = (string?)c.Element("Unit");
                    if (code is null || string.IsNullOrWhiteSpace(sell)) continue;
                    if (!Supported.Any(s => s.Code == code)) continue;
                    var u = decimal.TryParse(unit, NumberStyles.Any, CultureInfo.InvariantCulture, out var uu) && uu > 0 ? uu : 1;
                    rates[code] = decimal.Parse(sell, CultureInfo.InvariantCulture) / u;
                }
                _cache = new RateSnapshot(rates, (string?)doc.Root?.Attribute("Tarih"));
                _cachedAt = DateTime.UtcNow;
            }
            catch (Exception ex)
            {
                log.LogWarning(ex, "TCMB kurları alınamadı");
                _cache ??= new RateSnapshot([], null);
            }
            return _cache;
        }
        finally { _lock.Release(); }
    }

    public async Task<Dictionary<string, string>> GetSettingsAsync() =>
        await db.Settings.AsNoTracking().ToDictionaryAsync(s => s.Key, s => s.Value);

    public static decimal? ParseManual(Dictionary<string, string> st, string code) =>
        st.TryGetValue($"Manual:{code}", out var v)
        && decimal.TryParse(v, NumberStyles.Any, CultureInfo.InvariantCulture, out var d) && d > 0 ? d : null;

    // Etkin kur: mod "Manual" ise manuel değer (yoksa otomatiğe düşer), "Auto" ise TCMB (yoksa manuele düşer).
    public async Task<decimal?> GetEffectiveRateAsync(string code)
    {
        if (code == "TRY") return 1;
        var st = await GetSettingsAsync();
        var manual = ParseManual(st, code);
        var mode = st.GetValueOrDefault("RateMode", "Auto");
        var auto = (await GetAutoRatesAsync()).Auto.GetValueOrDefault(code);
        if (mode == "Manual") return manual ?? (auto > 0 ? auto : null);
        return auto > 0 ? auto : manual;
    }
}
