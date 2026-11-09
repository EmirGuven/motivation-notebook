using Crm.Api.Data;
using Crm.Api.Models;
using Crm.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Endpoints;

public record UserInput(string Username, string Password);
public record PasswordInput(string Password);

public static class UserEndpoints
{
    const int MinPassword = 6;

    public static void MapUserEndpoints(this WebApplication app)
    {
        var g = app.MapGroup("/api/users");

        g.MapGet("/", async (CrmDbContext db) =>
            await db.Users.OrderBy(x => x.Username).Select(x => new { x.Id, x.Username, x.CreatedAt }).ToListAsync());

        g.MapPost("/", async (UserInput i, CrmDbContext db) =>
        {
            var name = i.Username?.Trim() ?? "";
            if (name.Length is < 3 or > 50) return Results.BadRequest("Kullanıcı adı 3–50 karakter olmalı.");
            if ((i.Password?.Length ?? 0) < MinPassword) return Results.BadRequest($"Şifre en az {MinPassword} karakter olmalı.");
            if (await db.Users.AnyAsync(x => x.Username == name)) return Results.BadRequest("Bu kullanıcı adı zaten var.");
            var u = new AppUser { Username = name, PasswordHash = PasswordHasher.Hash(i.Password!) };
            db.Users.Add(u);
            await db.SaveChangesAsync();
            return Results.Ok(new { u.Id, u.Username, u.CreatedAt });
        });

        g.MapPut("/{id:int}/password", async (int id, PasswordInput i, CrmDbContext db, TokenStore store) =>
        {
            if ((i.Password?.Length ?? 0) < MinPassword) return Results.BadRequest($"Şifre en az {MinPassword} karakter olmalı.");
            var u = await db.Users.FindAsync(id);
            if (u is null) return Results.NotFound();
            u.PasswordHash = PasswordHasher.Hash(i.Password!);
            await db.SaveChangesAsync();
            store.RevokeUser(u.Username);
            return Results.NoContent();
        });

        g.MapDelete("/{id:int}", async (int id, HttpContext ctx, CrmDbContext db, TokenStore store) =>
        {
            var u = await db.Users.FindAsync(id);
            if (u is null) return Results.NotFound();
            var me = store.UserOf(ctx.Request.Headers.Authorization.ToString().Replace("Bearer ", ""));
            if (u.Username == me) return Results.BadRequest("Kendi hesabını silemezsin.");
            if (await db.Users.CountAsync() <= 1) return Results.BadRequest("Son kullanıcı silinemez.");
            db.Users.Remove(u);
            await db.SaveChangesAsync();
            store.RevokeUser(u.Username);
            return Results.NoContent();
        });
    }
}
