"use client";

import { useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn, formatCurrencyFromCents } from "@/lib/utils";
import { useAuth } from "@/providers";
import { useTokenRates } from "@/providers/token-rate-provider";
import { useSubscription, useResumeSubscription, useSwitchSubscription, getSubscriptionState } from "@/services/tokens";
import { getPackageSavings } from "@/lib/stripe/utils";
import { ROUTES } from "@/lib/constants";
import { useCurrency } from "@/hooks/use-currency";
import type { SupportedCurrency } from "@/lib/constants/currency";
import type { StripePackage } from "@/types";

function PurchaseFeedback() {
  const searchParams = useSearchParams();
  const success = searchParams.get("success");
  const canceled = searchParams.get("canceled");

  if (success) {
    return (
      <div className="mb-8">
        <Alert variant="success" align="center">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <AlertDescription>
            Purchase successful!
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (canceled) {
    return (
      <div className="mb-8">
        <Alert variant="warning" align="center">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <AlertDescription>
            Purchase canceled. No charges were made.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return null;
}

function PackageCard({
  pkg,
  currency,
  locale,
  baseRate,
  onBuy,
  onResume,
  onSwitch,
  isLoading,
  isResuming,
  isSwitchingThis,
  isSwitchingAny,
  isCurrentTier,
  hasActiveSubscription,
  isCanceling,
}: {
  pkg: StripePackage;
  currency: SupportedCurrency;
  locale: string;
  baseRate: number;
  onBuy: (priceId: string) => void;
  onResume: () => void;
  onSwitch: (priceId: string, stripeProductId: string) => void;
  isLoading: boolean;
  isResuming: boolean;
  isSwitchingThis: boolean;
  isSwitchingAny: boolean;
  isCurrentTier: boolean;
  hasActiveSubscription: boolean;
  isCanceling: boolean;
}) {
  const priceInfo = pkg.prices[currency];

  const savings = getPackageSavings(priceInfo.unitAmount, pkg.tokenAmount, baseRate);
  const priceFormatted = formatCurrencyFromCents(priceInfo.unitAmount, currency, locale);
  const isSubscription = pkg.type === "subscription";
  // Active + renewing: fully locked. Active + canceling: show resume action.
  const isLockedPlan = isCurrentTier && !isCanceling;

  return (
    <Card className={cn("relative flex flex-col", isLockedPlan && "opacity-60")}>
      {isCurrentTier && isCanceling ? (
        <div className="absolute -top-3 right-4">
          <Badge variant="outline">Cancels at period end</Badge>
        </div>
      ) : isCurrentTier ? (
        <div className="absolute -top-3 right-4">
          <Badge variant="secondary">Current plan</Badge>
        </div>
      ) : savings > 0 ? (
        <div className="absolute -top-3 right-4">
          <Badge className="bg-green-600 text-white hover:bg-green-600">
            Save {formatCurrencyFromCents(savings, currency, locale)}{isSubscription ? "/mo" : ""}
          </Badge>
        </div>
      ) : null}
      <CardHeader className="text-center">
        <CardTitle className="text-lg">{pkg.name}</CardTitle>
        {pkg.description && (
          <p className="text-sm text-muted-foreground">{pkg.description}</p>
        )}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col items-center justify-end gap-4">
        <div className="text-center">
          <span className="text-3xl font-bold">{pkg.tokenAmount}</span>
          <span className="ml-1 text-muted-foreground">Sorgs</span>
        </div>
        <div className="text-center">
          <span className="text-xl font-semibold">{priceFormatted}</span>
          {isSubscription && (
            <span className="text-sm text-muted-foreground">/month</span>
          )}
        </div>
        {isCurrentTier && isCanceling ? (
          <Button
            className="w-full"
            onClick={onResume}
            disabled={isResuming}
          >
            {isResuming ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Resuming...
              </>
            ) : (
              "Resume Subscription"
            )}
          </Button>
        ) : isSubscription && hasActiveSubscription && !isCurrentTier ? (
          <Button
            className="w-full"
            variant="outline"
            onClick={() => onSwitch(priceInfo.priceId, pkg.stripeProductId)}
            disabled={isSwitchingAny}
          >
            {isSwitchingThis ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Switching...
              </>
            ) : (
              "Switch to this plan"
            )}
          </Button>
        ) : (
          <Button
            className="w-full"
            onClick={() => onBuy(priceInfo.priceId)}
            disabled={isLoading || isLockedPlan}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Redirecting to checkout...
              </>
            ) : isLockedPlan
              ? "Subscribed"
              : isSubscription
                ? "Subscribe"
                : "Buy Now"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

interface TokenPurchaseSectionProps {
  oneTimePackages: StripePackage[];
  subscriptionPackages: StripePackage[];
}

export function TokenPurchaseSection({
  oneTimePackages,
  subscriptionPackages,
}: TokenPurchaseSectionProps) {
  const { user, profile } = useAuth();
  const { currency, locale } = useCurrency();
  const { baseRates } = useTokenRates();
  const isCustomer = profile?.role === "customer";
  const { data: subscription } = useSubscription(profile?.id ?? "", isCustomer);
  const resumeMutation = useResumeSubscription(profile?.id ?? "");
  const switchMutation = useSwitchSubscription(profile?.id ?? "");
  const [loadingPriceId, setLoadingPriceId] = useState<string | null>(null);
  const [switchingProductId, setSwitchingProductId] = useState<string | null>(null);
  const [switchConfirm, setSwitchConfirm] = useState<{ priceId: string; stripeProductId: string; name: string; tokenAmount: number } | null>(null);
  const [checkoutError, setCheckoutError] = useState(false);
  const subState = getSubscriptionState(subscription);
  const baseRate = baseRates[currency];

  const startCheckout = useCallback(async (priceId: string) => {
    setLoadingPriceId(priceId);
    setCheckoutError(false);
    try {
      const response = await fetch("/api/checkout/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, currency, returnPath: window.location.pathname }),
      });

      const data = await response.json();
      if (data.url) {
        // Don't clear loading state — keep "Redirecting to checkout..." visible
        // until the browser navigates away
        window.location.href = data.url;
        return;
      }
      setCheckoutError(true);
    } catch {
      setCheckoutError(true);
    }
    setLoadingPriceId(null);
  }, [currency]);

  const handleBuy = (priceId: string) => {
    if (!user || profile?.role !== "customer") {
      window.location.href = `${ROUTES.login}?redirect=${encodeURIComponent(ROUTES.sorg)}`;
      return;
    }
    startCheckout(priceId);
  };

  const handleSwitchRequest = (priceId: string, stripeProductId: string) => {
    const pkg = subscriptionPackages.find((p) => p.stripeProductId === stripeProductId);
    if (!pkg) return;
    setSwitchConfirm({ priceId, stripeProductId, name: pkg.name, tokenAmount: pkg.tokenAmount });
  };

  const handleSwitchConfirm = () => {
    if (!switchConfirm) return;
    const { priceId, stripeProductId } = switchConfirm;
    setSwitchingProductId(stripeProductId);
    setSwitchConfirm(null);
    switchMutation.mutate({ priceId, stripeProductId }, {
      onSettled: () => setSwitchingProductId(null),
    });
  };

  // Check if user is on a legacy/archived tier not in current packages
  const isLegacyTier = subState.tier &&
    !subscriptionPackages.some((pkg) => pkg.stripeProductId === subState.tier);

  return (
    <div id="buy-sorgs" className="mx-auto mt-16 max-w-5xl scroll-mt-16">
      <Suspense fallback={null}>
        <PurchaseFeedback />
      </Suspense>
      {checkoutError && (
        <Alert variant="destructive" className="mb-8">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Something went wrong starting checkout. Please try again.
          </AlertDescription>
        </Alert>
      )}
      {switchMutation.isError && (
        <Alert variant="destructive" className="mb-8">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {switchMutation.error.message || "Failed to switch plan. Please try again."}
          </AlertDescription>
        </Alert>
      )}
      <h2 className="text-center text-2xl font-bold">Buy Sorgs</h2>
      <p className="mt-2 text-center text-muted-foreground">
        Purchase tokens to cover your child&apos;s weekly club sessions
      </p>

      {/* One-Time Packs */}
      {oneTimePackages.length > 0 && (
        <>
          <h3 className="mt-8 text-center text-lg font-semibold text-muted-foreground">One-Time Packs</h3>
          <div className="mt-4 grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {oneTimePackages.map((pkg) => (
              <PackageCard
                key={pkg.stripeProductId}
                pkg={pkg}
                currency={currency}
                locale={locale}
                baseRate={baseRate}
                onBuy={handleBuy}
                onResume={() => resumeMutation.mutate()}
                onSwitch={handleSwitchRequest}
                isLoading={loadingPriceId === pkg.prices[currency].priceId}
                isResuming={resumeMutation.isPending}
                isSwitchingThis={false}
                isSwitchingAny={switchMutation.isPending}
                isCurrentTier={false}
                hasActiveSubscription={subState.hasActiveSubscription}
                isCanceling={subState.status === "canceling"}
              />
            ))}
          </div>
        </>
      )}

      {/* Monthly Subscriptions */}
      {subscriptionPackages.length > 0 && (
        <>
          <h3 className="mt-10 text-center text-lg font-semibold text-muted-foreground">Monthly Subscriptions</h3>
          {isLegacyTier && (
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Your current plan is no longer available for new subscribers.
            </p>
          )}
          <div className="mt-4 grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {subscriptionPackages.map((pkg) => (
              <PackageCard
                key={pkg.stripeProductId}
                pkg={pkg}
                currency={currency}
                locale={locale}
                baseRate={baseRate}
                onBuy={handleBuy}
                onResume={() => resumeMutation.mutate()}
                onSwitch={handleSwitchRequest}
                isLoading={loadingPriceId === pkg.prices[currency].priceId}
                isResuming={resumeMutation.isPending}
                isSwitchingThis={switchingProductId === pkg.stripeProductId}
                isSwitchingAny={switchMutation.isPending}
                isCurrentTier={subState.tier === pkg.stripeProductId}
                hasActiveSubscription={subState.hasActiveSubscription}
                isCanceling={subState.status === "canceling"}
              />
            ))}
          </div>
        </>
      )}

      {!user && (
        <p className="mt-4 text-center text-sm text-muted-foreground">
          You&apos;ll need to sign in or create an account to purchase Sorgs.
        </p>
      )}

      <Dialog open={!!switchConfirm} onOpenChange={(open) => !open && setSwitchConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Switch to {switchConfirm?.name}?</DialogTitle>
            <DialogDescription>
              Your plan will change to {switchConfirm?.name} ({switchConfirm?.tokenAmount} Sorgs/month).
              The switch takes effect at the start of your next billing cycle — your current
              plan and Sorg allocation remain active until then.
              {subState.status === "canceling" && (
                <> This will also resume your subscription.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSwitchConfirm(null)}>
              Cancel
            </Button>
            <Button onClick={handleSwitchConfirm}>
              Switch Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
