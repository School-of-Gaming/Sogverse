"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CreditCard } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/providers";
import { useSubscription, useSubscriptionDetails, useCancelSubscription, useResumeSubscription, getSubscriptionState } from "@/services/tokens";
import { TOKEN_PACKAGES } from "@/lib/constants/tokens";
import { ROUTES } from "@/lib/constants";

const SUB_PACKAGE = TOKEN_PACKAGES.find((pkg) => pkg.type === "subscription");

function formatDate(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatPrice(amount: number | null, currency: string) {
  if (amount === null) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount / 100);
}

export function SubscriptionStatusCard() {
  const { profile } = useAuth();
  const { data: subscription } = useSubscription(profile?.id ?? "");
  const { data: details } = useSubscriptionDetails(profile?.id ?? "");
  const cancelMutation = useCancelSubscription(profile?.id ?? "");
  const resumeMutation = useResumeSubscription(profile?.id ?? "");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const subState = getSubscriptionState(subscription, details);

  if (subState.status === "none" || subState.status === "canceled") return null;

  const isPastDue = subState.status === "past_due";
  const isCanceling = subState.status === "canceling";
  const isActive = subState.status === "active";

  const handleCancel = async () => {
    await cancelMutation.mutateAsync();
    setConfirmOpen(false);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-secondary" />
            Monthly Pass
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isPastDue && (
            <Alert variant="destructive">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <AlertTitle>Payment failed</AlertTitle>
                <AlertDescription>
                  Your last payment didn&apos;t go through. Please{" "}
                  <Link
                    href={ROUTES.customer.billing}
                    className="font-medium text-destructive underline underline-offset-4 hover:text-destructive/80"
                  >
                    update your payment method
                  </Link>{" "}
                  to keep your subscription active.
                </AlertDescription>
              </div>
            </Alert>
          )}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">
                {SUB_PACKAGE ? `${SUB_PACKAGE.tokens} Sorgs/month` : "Subscription"}
                {details?.amount && (
                  <span className="text-muted-foreground"> — {formatPrice(details.amount, details.currency)}/mo</span>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {isActive && details?.currentPeriodEnd && (
                  <>Next payment: {formatDate(details.currentPeriodEnd)}</>
                )}
                {isActive && !details?.currentPeriodEnd && "Active — renews monthly"}
                {isCanceling && details?.currentPeriodEnd && (
                  <>Canceled — access until {formatDate(details.currentPeriodEnd)}</>
                )}
                {isCanceling && !details?.currentPeriodEnd && "Canceled — access until end of billing period"}
                {isPastDue && "Past due — update payment to continue"}
                {!isActive && !isCanceling && !isPastDue && `Status: ${subState.status}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {(isActive || isCanceling || isPastDue) && (
                <Link href={ROUTES.customer.billing} className={buttonVariants({ variant: "outline" })}>
                  Manage Billing
                </Link>
              )}
              {isCanceling && (
                <Button
                  variant="default"
                  onClick={() => resumeMutation.mutate()}
                  disabled={resumeMutation.isPending}
                >
                  {resumeMutation.isPending ? "Resuming..." : "Resume Subscription"}
                </Button>
              )}
              {isActive && (
                <Button
                  variant="outline"
                  onClick={() => setConfirmOpen(true)}
                >
                  Cancel Subscription
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel {SUB_PACKAGE?.name ?? "Subscription"}?</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel your {SUB_PACKAGE?.name ?? "subscription"}?
              {details?.amount && <> You&apos;ll lose the monthly rate of {formatPrice(details.amount, details.currency)}/mo.</>}
              {" "}Your current Sorgs will remain in your account, and you&apos;ll keep
              access until the end of your billing period.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Keep Subscription
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? "Canceling..." : "Yes, Cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
