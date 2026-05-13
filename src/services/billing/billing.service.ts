import type { PaymentMethodSummary } from "@/app/api/parent/payment-method/route";

export type { PaymentMethodSummary };

export class BillingService {
  async getDefaultPaymentMethod(): Promise<PaymentMethodSummary | null> {
    const res = await fetch("/api/parent/payment-method", { method: "GET" });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || "Failed to load payment method");
    }
    const data = (await res.json()) as {
      paymentMethod: PaymentMethodSummary | null;
    };
    return data.paymentMethod;
  }
}
