namespace Crm.Api.Models;

public enum SurgeryStatus
{
    Planned = 0,
    Completed = 1,
    Cancelled = 2
}

public class Surgery
{
    public int Id { get; set; }
    public int CustomerId { get; set; }
    public Customer? Customer { get; set; }

    public string Title { get; set; } = "";
    public DateTime Date { get; set; }
    public decimal Price { get; set; }
    // Price / PaidAmount bu para birimindedir. RateToTry: kayıt anındaki 1 birim = kaç TL (TRY için 1).
    public string Currency { get; set; } = "TRY";
    public decimal RateToTry { get; set; } = 1;
    public decimal PaidAmount { get; set; }
    // Komisyon yüzdesi (ör. 3 = %3). Komisyon = Price * CommissionRate / 100
    public decimal CommissionRate { get; set; }
    public SurgeryStatus Status { get; set; } = SurgeryStatus.Planned;
    public string? Notes { get; set; }
}
