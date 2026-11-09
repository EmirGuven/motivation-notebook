using Crm.Api.Services;

namespace Crm.Api.Endpoints;

public record ChatInput(List<ChatTurn> Messages);

public static class ChatEndpoints
{
    public static void MapChatEndpoints(this WebApplication app)
    {
        app.MapPost("/api/chat", async (ChatInput i, ChatService chat, ILogger<ChatService> log) =>
        {
            if (i.Messages is null || i.Messages.Count == 0 || i.Messages[^1].Role != "user")
                return Results.BadRequest(new { error = "Mesaj yok." });
            try
            {
                return Results.Ok(await chat.RunAsync(i.Messages));
            }
            catch (ChatNotConfiguredException ex)
            {
                return Results.Json(new { error = ex.Message, code = "not_configured" }, statusCode: 503);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Sohbet hatası");
                return Results.Json(new { error = "Claude'a ulaşılamadı: " + ex.Message }, statusCode: 502);
            }
        });
    }
}
