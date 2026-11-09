using Crm.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Crm.Api.Data;

public class CrmDbContext(DbContextOptions<CrmDbContext> options) : DbContext(options)
{
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<Surgery> Surgeries => Set<Surgery>();
    public DbSet<AppSetting> Settings => Set<AppSetting>();
    public DbSet<AppUser> Users => Set<AppUser>();

    // Npgsql "timestamptz" için yalnızca UTC kabul eder; query string'den gelen Unspecified tarihler de dahil hepsini UTC yap.
    protected override void ConfigureConventions(ModelConfigurationBuilder c)
    {
        c.Properties<DateTime>().HaveConversion<UtcDateTimeConverter>();
    }

    private sealed class UtcDateTimeConverter() : Microsoft.EntityFrameworkCore.Storage.ValueConversion.ValueConverter<DateTime, DateTime>(
        v => v.Kind == DateTimeKind.Utc ? v : v.Kind == DateTimeKind.Local ? v.ToUniversalTime() : DateTime.SpecifyKind(v, DateTimeKind.Utc),
        v => DateTime.SpecifyKind(v, DateTimeKind.Utc));

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Customer>().Property(x => x.FirstName).HasMaxLength(100).IsRequired();
        b.Entity<Customer>().Property(x => x.LastName).HasMaxLength(100).IsRequired();
        b.Entity<Surgery>().Property(x => x.Title).HasMaxLength(200).IsRequired();
        b.Entity<Surgery>().Property(x => x.Price).HasPrecision(18, 2);
        b.Entity<Surgery>().Property(x => x.PaidAmount).HasPrecision(18, 2);
        b.Entity<AppSetting>().HasKey(x => x.Key);
        b.Entity<AppUser>().Property(x => x.Username).HasMaxLength(50).IsRequired();
        b.Entity<AppUser>().HasIndex(x => x.Username).IsUnique();
        b.Entity<Surgery>().Property(x => x.Currency).HasMaxLength(3).IsRequired();
        b.Entity<Surgery>().Property(x => x.RateToTry).HasPrecision(18, 6);
        b.Entity<Surgery>().Property(x => x.CommissionRate).HasPrecision(5, 2);
        b.Entity<Surgery>().HasOne(x => x.Customer).WithMany(c => c.Surgeries)
            .HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Cascade);
    }
}
