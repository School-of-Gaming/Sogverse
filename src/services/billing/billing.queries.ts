"use client";

import { useQuery } from "@tanstack/react-query";
import { BillingService } from "./billing.service";

export const billingKeys = {
  all: ["billing"] as const,
  paymentMethod: () => [...billingKeys.all, "paymentMethod"] as const,
};

export function useDefaultPaymentMethod() {
  return useQuery({
    queryKey: billingKeys.paymentMethod(),
    queryFn: () => new BillingService().getDefaultPaymentMethod(),
  });
}
