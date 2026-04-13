"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CreditCard } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
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
import { useRequiredAuth } from "@/providers";
import { useSubscription, useSubscriptionDetails, useCancelSubscription, useResumeSubscription, getSubscriptionState } from "@/services/tokens";
import { ROUTES } from "@/lib/constants";
import { formatCurrencyFromCents, formatDate } from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";
import { isSupportedCurrency, type SupportedCurrency } from "@/lib/constants/currency";

function formatPeriodDate(timestamp: number, locale: string) {
  return formatDate(new Date(timestamp * 1000), locale, {
    dateStyle: "long",
  });
}

export function SubscriptionStatusCard() {
  const t = useTranslations('tokens');
  const { profile } = useRequiredAuth();
  const { currency: displayCurrency } = useCurrency();
  const locale = useLocale();
  const { data: subscription } = useSubscription(profile.id);
  const { data: details } = useSubscriptionDetails(profile.id);
  const cancelMutation = useCancelSubscription(profile.id);
  const resumeMutation = useResumeSubscription(profile.id);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const subState = getSubscriptionState(subscription);

  if (subState.status === "none" || subState.status === "canceled") return null;

  const isPastDue = subState.status === "past_due";
  const isCanceling = subState.status === "canceling";
  const isActive = subState.status === "active";

  // Use the actual billing currency from Stripe for price display
  const billingCurrency: SupportedCurrency =
    details?.currency && isSupportedCurrency(details.currency)
      ? details.currency
      : displayCurrency;

  // Dynamic tier name from subscription details
  const tierLabel = details?.productName && details.tokenAmount
    ? t('subscription.tierLabelFull', { name: details.productName, amount: details.tokenAmount })
    : details?.tokenAmount
      ? t('subscription.tierLabelAmount', { amount: details.tokenAmount })
      : t('subscription.label');

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
            {tierLabel}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isPastDue && (
            <Alert variant="destructive">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <AlertTitle>{t('subscription.paymentFailed')}</AlertTitle>
                <AlertDescription>
                  {t.rich('subscription.paymentFailedDescription', { link: (chunks) => <Link href={ROUTES.customer.billing} className="font-medium text-destructive underline underline-offset-4 hover:text-destructive/80">{chunks}</Link> })}
                </AlertDescription>
              </div>
            </Alert>
          )}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">
                {tierLabel}
                {details?.amount && (
                  // eslint-disable-next-line i18next/no-literal-string -- em dash separator
                  <span className="text-muted-foreground">{" — "}{formatCurrencyFromCents(details.amount, billingCurrency, locale)}{t('package.perMonth')}</span>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {isActive && details?.currentPeriodEnd && (
                  <>{t('subscription.nextPayment', { date: formatPeriodDate(details.currentPeriodEnd, locale) })}</>
                )}
                {isActive && !details?.currentPeriodEnd && t('subscription.activeRenews')}
                {isCanceling && details?.currentPeriodEnd && (
                  <>{t('subscription.canceledAccessUntil', { date: formatPeriodDate(details.currentPeriodEnd, locale) })}</>
                )}
                {isCanceling && !details?.currentPeriodEnd && t('subscription.canceledAccessUntilEnd')}
                {isPastDue && t('subscription.pastDue')}
                {!isActive && !isCanceling && !isPastDue && t('subscription.status', { status: subState.status })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {(isActive || isCanceling || isPastDue) && (
                <Link href={ROUTES.customer.billing} className={buttonVariants({ variant: "outline" })}>
                  {t('subscription.manageBilling')}
                </Link>
              )}
              {isCanceling && (
                <Button
                  variant="default"
                  onClick={() => resumeMutation.mutate()}
                  disabled={resumeMutation.isPending}
                >
                  {resumeMutation.isPending ? t('subscription.resuming') : t('subscription.resume')}
                </Button>
              )}
              {isActive && (
                <Button
                  variant="outline"
                  onClick={() => setConfirmOpen(true)}
                >
                  {t('subscription.cancelSubscription')}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('subscription.cancelDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('subscription.cancelDialog.description')}
              {details?.amount && <> {t('subscription.cancelDialog.loseRate', { rate: formatCurrencyFromCents(details.amount, billingCurrency, locale) })}</>}
              {" "}{t('subscription.cancelDialog.keepAccess')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t('subscription.cancelDialog.keep')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? t('subscription.cancelDialog.canceling') : t('subscription.cancelDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
