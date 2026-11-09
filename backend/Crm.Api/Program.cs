using Crm.Api.Data;
using Crm.Api.Endpoints;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<CrmDbContext>(o =>
    o.UseNpgsql(builder.Configuration.GetConnectionString("Default")));

builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.SetIsOriginAllowed(_ => true).AllowAnyHeader().AllowAnyMethod())); // oturum Bearer token ile; telefondan (LAN adresi) de açılabilsin

builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
    // Customer <-> Surgery çift yönlü ilişkisi yanıtta sonsuz döngüye girmesin.
    o.SerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
});

builder.Services.AddSingleton<TokenStore>();
builder.Services.AddHttpClient();
builder.Services.AddScoped<Crm.Api.Services.ChatTools>();
builder.Services.AddScoped<Crm.Api.Services.RuleBot>();
builder.Services.AddScoped<Crm.Api.Services.ChatService>();
builder.Services.AddScoped<Crm.Api.Services.ExchangeRateService>();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
    scope.ServiceProvider.GetRequiredService<CrmDbContext>().Database.Migrate();

await app.SeedFirstUserAsync();

app.UseCors();

app.Use(async (ctx, next) =>
{
    var path = ctx.Request.Path;
    var open = !path.StartsWithSegments("/api")
        || path.StartsWithSegments("/api/auth/login")
        || path.StartsWithSegments("/api/health")
        || ctx.Request.Method == "OPTIONS";
    if (!open)
    {
        var token = ctx.Request.Headers.Authorization.ToString().Replace("Bearer ", "");
        if (!ctx.RequestServices.GetRequiredService<TokenStore>().IsValid(token))
        {
            ctx.Response.StatusCode = 401;
            return;
        }
    }
    await next();
});

app.MapAuthEndpoints();
app.MapUserEndpoints();
app.MapCustomerEndpoints();
app.MapSurgeryEndpoints();
app.MapReportEndpoints();
app.MapSettingsEndpoints();
app.MapLogoEndpoints();
app.MapTargetEndpoints();
app.MapPrimEndpoints();
app.MapChatEndpoints();
app.MapGet("/api/health", () => Results.Ok("ok"));

app.Run();
