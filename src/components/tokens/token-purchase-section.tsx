"use client";

import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Coins, Sparkles, Zap, Loader2, AlertCircle, AlertTriangle, Check, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers";
import { useSubscription, useSubscriptionDetails, useResumeSubscription, tokenKeys } from "@/services/tokens";
import { TOKEN_PACKAGES, type TokenPackage, type TokenPackageId } from "@/lib/constants/tokens";

const PACKAGE_ICONS: Record<TokenPackageId, LucideIcon> = {
  tokens_5: Coins,
  tokens_20: Zap,
  tokens_sub_25: Sparkles,
};

function PurchaseFeedback() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const success = searchParams.get("success");
  const sessionId = searchParams.get("session_id");
  const canceled = searchParams.get("canceled");
  const [verifying, setVerifying] = useState(!!sessionId);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState(false);
  const verifiedRef = useRef(false);

  useEffect(() => {
    if (!sessionId || verifiedRef.current) return;
    verifiedRef.current = true;

    async function verifySession() {
      try {
        const res = await fetch("/api/checkout/verify-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });

        if (!res.ok) {
          setError(true);
          return;
        }

        setVerified(true);
        // Invalidate token queries so balance and transactions update
        if (profile?.id) {
          queryClient.invalidateQueries({ queryKey: tokenKeys.balance(profile.id) });
          queryClient.invalidateQueries({ queryKey: tokenKeys.transactions(profile.id) });
          queryClient.invalidateQueries({ queryKey: tokenKeys.subscription(profile.id) });
        }
      } catch {
        setError(true);
      } finally {
        setVerifying(false);
      }
    }

    verifySession();
  }, [sessionId, profile?.id, queryClient]);

  if (verifying) {
    return (
      <div className="mb-8">
        <Alert variant="info">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
          <AlertDescription>Confirming your purchase...</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-8">
        <Alert variant="destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <AlertDescription>
            Something went wrong confirming your purchase. Your payment was received — if your balance doesn&apos;t update shortly, please contact support.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (success || verified) {
    return (
      <div className="mb-8">
        <Alert variant="success">
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
          <AlertDescription>
            Purchase successful! Your Sorgs have been added to your balance.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (canceled) {
    return (
      <div className="mb-8">
        <Alert variant="warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
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
  icon: Icon,
  onBuy,
  onResume,
  isLoading,
  isResuming,
  hasActiveSubscription,
  isCanceling,
}: {
  pkg: TokenPackage;
  icon: React.ElementType;
  onBuy: (packageId: string) => void;
  onResume: () => void;
  isLoading: boolean;
  isResuming: boolean;
  hasActiveSubscription: boolean;
  isCanceling: boolean;
}) {
  const priceFormatted = `$${(pkg.priceCents / 100).toFixed(2)}`;
  const isSubscription = pkg.type === "subscription";
  const isCurrentPlan = isSubscription && hasActiveSubscription;
  // Active + renewing: fully locked. Active + canceling: show resume action.
  const isLockedPlan = isCurrentPlan && !isCanceling;

  return (
    <Card className={cn("relative flex flex-col", isLockedPlan && "opacity-60")}>
      {isCurrentPlan && isCanceling ? (
        <div className="absolute -top-3 right-4">
          <Badge variant="outline">Cancels at period end</Badge>
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
        {isCurrentPlan && isCanceling ? (
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
        ) : (
          <Button
            className="w-full"
            onClick={() => onBuy(pkg.id)}
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

export function TokenPurchaseSection() {
  const { user, profile } = useAuth();
  const { data: subscription } = useSubscription(profile?.id ?? "");
  const { data: details } = useSubscriptionDetails(profile?.id ?? "");
  const resumeMutation = useResumeSubscription(profile?.id ?? "");
  const [loadingPackage, setLoadingPackage] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState(false);
  const hasActiveSubscription =
    (subscription?.subscription_status === "active" ||
      subscription?.subscription_status === "past_due") &&
    !!subscription?.stripe_subscription_id;

  const startCheckout = useCallback(async (packageId: string) => {
    setLoadingPackage(packageId);
    setCheckoutError(false);
    try {
      const response = await fetch("/api/checkout/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId, returnPath: window.location.pathname }),
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
    setLoadingPackage(null);
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
      {checkoutError && (
        <Alert variant="destructive" className="mb-8">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Something went wrong starting checkout. Please try again.
          </AlertDescription>
        </Alert>
      )}
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
            onResume={() => resumeMutation.mutate()}
            isLoading={loadingPackage === pkg.id}
            isResuming={resumeMutation.isPending}
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
