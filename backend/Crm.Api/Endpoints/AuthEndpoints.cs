using System.Collections.Concurrent;
using System.Security.Cryptography;
using Crm.Api.Data;
using Crm.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Endpoints;

public record LoginInput(string Username, string Password);

// Basit oturum: token bellekte tutulur, API yeniden başlayınca girişler düşer.
// Kullanıcılar Users tablosunda; appsettings "Auth" bölümü yalnızca tablo boşken ilk kullanıcıyı oluşturur.
public class TokenStore
{
    private readonly ConcurrentDictionary<string, string> _tokens = new();
    public string Issue(string user)
    {
        var t = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        _tokens[t] = user;
        return t;
    }
    public bool IsValid(string? token) => token is not null && _tokens.ContainsKey(token);
    public string? UserOf(string? token) => token is not null && _tokens.TryGetValue(token, out var u) ? u : null;
    public void Revoke(string token) => _tokens.TryRemove(token, out _);
    // Kullanıcı silinince ya da şifresi değişince açık oturumları düşür.
    public void RevokeUser(string user)
    {
        foreach (var kv in _tokens.Where(kv => kv.Value == user)) _tokens.TryRemove(kv.Key, out _);
    }
}

public static class AuthEndpoints
{
    public static async Task SeedFirstUserAsync(this WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
        if (await db.Users.AnyAsync()) return;
        var cfg = app.Configuration;
        var user = cfg["Auth:Username"] ?? "admin";
        var pass = cfg["Auth:Password"] ?? "admin123";
        db.Users.Add(new Models.AppUser { Username = user, PasswordHash = PasswordHasher.Hash(pass) });
        await db.SaveChangesAsync();
    }

    public static void MapAuthEndpoints(this WebApplication app)
    {
        app.MapPost("/api/auth/login", async (LoginInput i, TokenStore store, CrmDbContext db) =>
        {
            var u = await db.Users.FirstOrDefaultAsync(x => x.Username == i.Username);
            if (u is null || !PasswordHasher.Verify(i.Password, u.PasswordHash))
                return Results.Json(new { error = "Kullanıcı adı veya şifre hatalı." }, statusCode: 401);
            return Results.Ok(new { token = store.Issue(u.Username), username = u.Username });
        });

        app.MapPost("/api/auth/logout", (HttpContext ctx, TokenStore store) =>
        {
            var t = ctx.Request.Headers.Authorization.ToString().Replace("Bearer ", "");
            store.Revoke(t);
            return Results.NoContent();
        });
    }
}
