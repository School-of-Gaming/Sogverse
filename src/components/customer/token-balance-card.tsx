"use client";

import { Coins } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/providers";
import { useTokenBalance } from "@/services/tokens";

export function TokenBalanceCard() {
  const { profile } = useAuth();
  const isCustomer = profile?.role === "customer";
  const { data: balance, isLoading } = useTokenBalance(profile?.id ?? "", isCustomer);

  return (
    <Card className="bg-gradient-to-r from-primary/5 to-secondary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="h-5 w-5 text-primary" />
          Sorg Balance
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-10 w-20 animate-pulse rounded bg-muted" />
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold">
              {balance ?? 0}
            </span>
            <span className="text-muted-foreground">Sorgs</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
