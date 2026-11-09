using System.Text.Json;
using Anthropic;
using Anthropic.Models.Messages;

namespace Crm.Api.Services;

public record ChatTurn(string Role, string Content);
public record ChatReply(string Reply, List<string> Actions, bool Changed, bool Basic = false);

public class ChatNotConfiguredException(string message) : Exception(message);

public class ChatService(ChatTools tools, RuleBot basic, IConfiguration cfg, ILogger<ChatService> log)
{
    private const int MaxSteps = 8;

    private static JsonElement P(object o) => JsonSerializer.SerializeToElement(o);

    private static Tool Def(string name, string description, Dictionary<string, object> props, params string[] required) => new()
    {
        Name = name,
        Description = description,
        InputSchema = new()
        {
            Properties = props.ToDictionary(kv => kv.Key, kv => P(kv.Value)),
            Required = required.ToList(),
        },
    };

    private static object S(string d) => new { type = "string", description = d };
    private static object N(string d) => new { type = "number", description = d };
    private static object I(string d) => new { type = "integer", description = d };

    private static readonly List<ToolUnion> Tools =
    [
        Def("search_patients",
            "Hastaları ada göre arar; telefon, notlar ve tüm kayıtlarını (recordId, hizmet, tarih, tutar, durum) döndürür. Bir hastayı düzeltmeden/not eklemeden önce mutlaka bununla bul. Boş sorgu son hastaları listeler.",
            new() { ["query"] = S("Ad veya soyadın bir kısmı") }),
        Def("add_patient",
            "Yeni hasta kaydı ekler (aynı isimde hasta varsa ona yeni kayıt ekler). Sadece ad gerekir; hizmet, tarih ve tutar boş olabilir (tarih boşsa bugün, tutar boşsa 0), kullanıcı sonradan düzeltebilir.",
            new()
            {
                ["name"] = S("Hasta adı soyadı"),
                ["service"] = S("Hizmet, örn. Saç ekimi"),
                ["date"] = S("Geliş tarihi, yyyy-MM-dd"),
                ["amount"] = N("Ciro tutarı (para biriminde)"),
                ["currency"] = S("TRY, USD, EUR, GBP veya CHF. Verilmezse varsayılan para birimi"),
            }, "name"),
        Def("update_record",
            "Bir hasta kaydının (recordId) hizmet, tarih, tutar, para birimi, durum veya notunu düzeltir. Sadece değişecek alanları ver.",
            new()
            {
                ["record_id"] = I("search_patients'ten gelen recordId"),
                ["service"] = S("Yeni hizmet"),
                ["date"] = S("Yeni tarih, yyyy-MM-dd"),
                ["amount"] = N("Yeni ciro tutarı"),
                ["currency"] = S("TRY, USD, EUR, GBP veya CHF"),
                ["status"] = S("Planned, Completed veya Cancelled (iptal)"),
                ["note"] = S("Kayda not"),
            }, "record_id"),
        Def("update_patient",
            "Hastanın adını, telefonunu veya e-postasını düzeltir.",
            new()
            {
                ["patient_id"] = I("search_patients'ten gelen patientId"),
                ["name"] = S("Yeni ad soyad"),
                ["phone"] = S("Telefon"),
                ["email"] = S("E-posta"),
            }, "patient_id"),
        Def("add_note",
            "Hastaya tarihli not ekler (mevcut notların altına yazar, silmez).",
            new() { ["patient_id"] = I("search_patients'ten gelen patientId"), ["note"] = S("Not metni") },
            "patient_id", "note"),
        Def("month_summary",
            "Bir ayın hasta sayısını, TL cirosunu, hedefini, kalan hedefi, %1-%5 komisyon kazancını ve kayıtlarını döndürür. Ay/yıl verilmezse bu ay.",
            new() { ["year"] = I("Yıl"), ["month"] = I("Ay (1-12)") }),
        Def("set_monthly_target",
            "Bir ayın ciro hedefini (₺) ayarlar. 0 verilirse hedefi siler.",
            new() { ["year"] = I("Yıl"), ["month"] = I("Ay (1-12)"), ["amount"] = N("Hedef tutarı ₺") },
            "month", "amount"),
    ];

    private static string SystemPrompt() => $"""
        Sen bir CRM uygulamasının içindeki Türkçe asistansın. Kullanıcı, hasta getirip ciro üzerinden komisyon alan biri; seninle yazarak hasta kaydeder, not alır ve kayıtları düzeltir. Verileri araçlarla okuyup yazarsın.

        Bugün: {DateTime.Now:yyyy-MM-dd dddd}. "Yarın", "gelecek salı", "15 Kasım" gibi tarihleri buna göre yyyy-MM-dd'ye çevir; yıl söylenmediyse en yakın mantıklı tarihi seç.

        Kurallar:
        - Hasta eklemek için sadece ad gerekir. Hizmet, tarih veya tutar söylenmediyse sorma, boş bırakıp kaydet ve eksik olanı özetinde belirt (kullanıcı sonradan düzeltebilir). Hiçbir değeri uydurma.
        - Bir hastayı düzeltmeden veya ona not eklemeden önce search_patients ile bul. Birden fazla hasta eşleşirse veya hangi kaydın kastedildiği belirsizse sor; tahmin etme.
        - Para birimi belirtilmediyse parametreyi boş bırak (varsayılan kullanılır). Kur sistemde Ayarlar'dan gelir, sen kur girmezsin.
        - Silme yeteneğin yok. Silme istenirse bunu Müşteriler sayfasından yapabileceğini söyle.
        - Yaptığın işi bir iki cümleyle özetle (kime ne yazdın). Araç hata verirse hatayı olduğu gibi söyle, başarılı gibi davranma.
        - Kısa ve net yaz. Tutarları binlik ayraçla yaz.
        """;

    public async Task<ChatReply> RunAsync(IReadOnlyList<ChatTurn> history)
    {
        var key = cfg["Anthropic:ApiKey"] ?? Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY");
        if (string.IsNullOrWhiteSpace(key))
        {
            // Anahtar yok: kural tabanlı basit bot son kullanıcı mesajını işler.
            var r = await basic.RunAsync(history.LastOrDefault(t => t.Role == "user")?.Content ?? "");
            return r with { Basic = true };
        }

        AnthropicClient client = new() { ApiKey = key };
        var model = cfg["Anthropic:Model"] ?? "claude-opus-5-5";

        List<MessageParam> messages = history
            .Where(t => !string.IsNullOrWhiteSpace(t.Content))
            .Select(t => new MessageParam { Role = t.Role == "assistant" ? Role.Assistant : Role.User, Content = t.Content })
            .ToList();

        var actions = new List<string>();
        var changed = false;

        for (var step = 0; step < MaxSteps; step++)
        {
            var response = await client.Messages.Create(new MessageCreateParams
            {
                Model = model,
                MaxTokens = 8000,
                System = SystemPrompt(),
                Tools = Tools,
                Messages = messages,
            });

            if (response.StopReason == StopReason.Refusal)
                return new ChatReply("Bu isteğe yardımcı olamadım.", actions, changed);

            var assistant = new List<ContentBlockParam>();
            var results = new List<ContentBlockParam>();
            var text = new List<string>();

            foreach (ContentBlock block in response.Content)
            {
                if (block.TryPickText(out TextBlock? tb))
                {
                    assistant.Add(new TextBlockParam { Text = tb.Text });
                    text.Add(tb.Text);
                }
                else if (block.TryPickThinking(out ThinkingBlock? th))
                {
                    assistant.Add(new ThinkingBlockParam { Thinking = th.Thinking, Signature = th.Signature });
                }
                else if (block.TryPickRedactedThinking(out RedactedThinkingBlock? rt))
                {
                    assistant.Add(new RedactedThinkingBlockParam { Data = rt.Data });
                }
                else if (block.TryPickToolUse(out ToolUseBlock? tu))
                {
                    assistant.Add(new ToolUseBlockParam { ID = tu.ID, Name = tu.Name, Input = tu.Input });
                    var input = JsonSerializer.SerializeToElement(tu.Input);
                    var r = await tools.ExecuteAsync(tu.Name, input);
                    if (r.Action is not null) actions.Add(r.Action);
                    changed |= r.Changed;
                    results.Add(new ToolResultBlockParam { ToolUseID = tu.ID, Content = r.Json, IsError = r.IsError });
                }
            }

            if (results.Count == 0)
            {
                var reply = string.Join("\n", text).Trim();
                if (response.StopReason == StopReason.MaxTokens) reply += "\n\n(Yanıt uzunluk sınırında kesildi.)";
                return new ChatReply(reply.Length > 0 ? reply : "Tamam.", actions, changed);
            }

            messages.Add(new MessageParam { Role = Role.Assistant, Content = assistant });
            messages.Add(new MessageParam { Role = Role.User, Content = results });
        }

        log.LogWarning("Sohbet araç döngüsü {Max} adımda bitmedi", MaxSteps);
        return new ChatReply("İşlem çok uzadı, bir kısmı yapılmış olabilir. Kayıtları kontrol edip tekrar dener misin?", actions, changed);
    }
}
