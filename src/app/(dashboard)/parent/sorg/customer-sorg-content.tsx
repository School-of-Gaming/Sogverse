"use client";

import { Coins } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TokenBalanceCard, SubscriptionStatusCard } from "@/components/customer";
import { TokenPurchaseSection, TransactionHistoryTable } from "@/components/tokens";
import { useAuth } from "@/providers";
import { useCurrency } from "@/hooks/use-currency";
import { useTokenTransactions } from "@/services/tokens";
import type { StripePackage } from "@/types";

interface CustomerSorgContentProps {
  oneTimePackages: StripePackage[];
  subscriptionPackages: StripePackage[];
}

export function CustomerSorgContent({
  oneTimePackages,
  subscriptionPackages,
}: CustomerSorgContentProps) {
  const t = useTranslations('parent');
  const { profile } = useAuth();
  const { locale } = useCurrency();
  const { data: transactions, isLoading } = useTokenTransactions(profile?.id ?? "");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Coins className="h-8 w-8 text-primary" />
          {t('sorg.title')}
        </h1>
        <p className="text-muted-foreground">
          {t('sorg.subtitle')}
        </p>
      </div>

      <TokenBalanceCard />
      <SubscriptionStatusCard />

      <TokenPurchaseSection
        oneTimePackages={oneTimePackages}
        subscriptionPackages={subscriptionPackages}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('sorg.transactionHistory')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-8 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : (
            <TransactionHistoryTable transactions={transactions} locale={locale} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
