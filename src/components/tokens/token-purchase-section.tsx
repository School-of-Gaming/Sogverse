"use client";

import { useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Coins, Sparkles, Zap, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/providers";
import { useSubscription, useSubscriptionDetails } from "@/services/tokens";
import { TOKEN_PACKAGES, type TokenPackage, type TokenPackageId } from "@/lib/constants/tokens";

const PACKAGE_ICONS: Record<TokenPackageId, LucideIcon> = {
  tokens_5: Coins,
  tokens_20: Zap,
  tokens_sub_25: Sparkles,
};

function PurchaseFeedback() {
  const searchParams = useSearchParams();
  const success = searchParams.get("success");
  const canceled = searchParams.get("canceled");

  if (success) {
    return (
      <div className="mb-8 rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-center text-green-400">
        Purchase successful! Your Sorgs have been added to your balance.
      </div>
    );
  }

  if (canceled) {
    return (
      <div className="mb-8 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-center text-yellow-400">
        Purchase canceled. No charges were made.
      </div>
    );
  }

  return null;
}

function PackageCard({
  pkg,
  icon: Icon,
  onBuy,
  isLoading,
  hasActiveSubscription,
  isCanceling,
}: {
  pkg: TokenPackage;
  icon: React.ElementType;
  onBuy: (packageId: string) => void;
  isLoading: boolean;
  hasActiveSubscription: boolean;
  isCanceling: boolean;
}) {
  const priceFormatted = `$${(pkg.priceCents / 100).toFixed(2)}`;
  const isSubscription = pkg.type === "subscription";
  const isCurrentPlan = isSubscription && hasActiveSubscription;

  return (
    <Card className={`relative flex flex-col${isCurrentPlan ? " opacity-60" : ""}`}>
      {isCurrentPlan && isCanceling ? (
        <div className="absolute -top-3 right-4">
          <Badge variant="outline">Canceled</Badge>
        </div>
      ) : isCurrentPlan ? (
        <div className="absolute -top-3 right-4">
          <Badge variant="secondary">Current plan</Badge>
        </div>
      ) : pkg.savingsCents ? (
        <div className="absolute -top-3 right-4">
          <Badge className="bg-green-600 text-white hover:bg-green-600">
            Save ${(pkg.savingsCents / 100).toFixed(0)}{isSubscription ? "/mo" : ""}
          </Badge>
        </div>
      ) : null}
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-lg">{pkg.name}</CardTitle>
        <p className="text-sm text-muted-foreground">{pkg.description}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col items-center justify-end gap-4">
        <div className="text-center">
          <span className="text-3xl font-bold">{pkg.tokens}</span>
          <span className="ml-1 text-muted-foreground">Sorgs</span>
        </div>
        <div className="text-center">
          <span className="text-xl font-semibold">{priceFormatted}</span>
          {isSubscription && (
            <span className="text-sm text-muted-foreground">/month</span>
          )}
        </div>
        <Button
          className="w-full"
          onClick={() => onBuy(pkg.id)}
          disabled={isLoading || isCurrentPlan}
        >
          {isCurrentPlan && isCanceling
            ? "Canceled"
            : isCurrentPlan
              ? "Subscribed"
              : isSubscription
                ? "Subscribe"
                : "Buy Now"}
        </Button>
      </CardContent>
    </Card>
  );
}

export function TokenPurchaseSection() {
  const { user, profile } = useAuth();
  const { data: subscription } = useSubscription(profile?.id ?? "");
  const { data: details } = useSubscriptionDetails(profile?.id ?? "");
  const [loadingPackage, setLoadingPackage] = useState<string | null>(null);
  const hasActiveSubscription =
    (subscription?.subscription_status === "active" ||
      subscription?.subscription_status === "canceled" ||
      subscription?.subscription_status === "past_due") &&
    !!subscription?.stripe_subscription_id;

  const startCheckout = useCallback(async (packageId: string) => {
    setLoadingPackage(packageId);
    try {
      const response = await fetch("/api/checkout/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } finally {
      setLoadingPackage(null);
    }
  }, []);

  const handleBuy = (packageId: string) => {
    if (!user || profile?.role !== "customer") {
      window.location.href = `/login?redirect=${encodeURIComponent(`/checkout?package=${packageId}`)}`;
      return;
    }
    startCheckout(packageId);
  };

  return (
    <div id="buy-sorgs" className="mx-auto mt-16 max-w-5xl scroll-mt-16">
      <Suspense>
        <PurchaseFeedback />
      </Suspense>
      <h2 className="text-center text-2xl font-bold">Buy Sorgs</h2>
      <p className="mt-2 text-center text-muted-foreground">
        Top up your balance and power up your Sogverse experience
      </p>
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {TOKEN_PACKAGES.map((pkg) => (
          <PackageCard
            key={pkg.id}
            pkg={pkg}
            icon={PACKAGE_ICONS[pkg.id] ?? Coins}
            onBuy={handleBuy}
            isLoading={loadingPackage === pkg.id}
            hasActiveSubscription={hasActiveSubscription}
            isCanceling={details?.cancelAtPeriodEnd === true}
          />
        ))}
      </div>
      {!user && (
        <p className="mt-4 text-center text-sm text-muted-foreground">
          You&apos;ll need to sign in or create an account to purchase Sorgs.
        </p>
      )}
    </div>
  );
}
