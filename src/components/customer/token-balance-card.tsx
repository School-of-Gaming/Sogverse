"use client";

import { Coins, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers";
import { useTokenBalance } from "@/services/tokens";

export function TokenBalanceCard() {
  const { profile } = useAuth();
  const { data: balance, isLoading, isFetching } = useTokenBalance(profile?.id ?? "");

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
            <span className={cn("text-4xl font-bold", isFetching && "opacity-50")}>
              {balance ?? 0}
            </span>
            <span className="text-muted-foreground">Sorgs</span>
            {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
