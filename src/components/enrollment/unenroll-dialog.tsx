"use client";

import { useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useUnenrollGamer } from "@/services/enrollments";
import { ENROLLMENT_CHARGE_WINDOW_HOURS } from "@/lib/constants/enrollment";

interface UnenrollDialogProps {
  enrollmentId: string;
  productName: string;
  gamerDisplayName: string;
  tokenCost: number;
  refundEligible: boolean;
  refundDenialReason?: "within_window" | "session_past";
  onClose: () => void;
  /** Called after the user dismisses a successful unenroll (after invalidation). */
  onSuccess?: () => void;
}

export function UnenrollDialog({
  enrollmentId,
  productName,
  gamerDisplayName,
  tokenCost,
  refundEligible,
  refundDenialReason,
  onClose,
  onSuccess,
}: UnenrollDialogProps) {
  const t = useTranslations('enrollment');
  const c = useTranslations('common');
  const { invalidateEnrollments, ...unenroll } = useUnenrollGamer();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    refunded: boolean;
    refundAmount: number;
    newBalance: number;
  } | null>(null);

  const handleClose = () => {
    if (success) {
      invalidateEnrollments();
      onSuccess?.();
    }
    onClose();
  };

  const handleUnenroll = async () => {
    setError(null);
    try {
      const result = await unenroll.mutateAsync(enrollmentId);
      setSuccess(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('unenroll.failedToUnenroll'));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && handleClose()}>
      <DialogContent>
        {success ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-success" />
                {t('unenroll.successTitle')}
              </DialogTitle>
              <DialogDescription>
                {t.rich('unenroll.successDescription', { gamer: gamerDisplayName, club: productName, strong: (chunks) => <strong>{chunks}</strong> })}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2 space-y-3 rounded-md border border-border p-4 text-sm">
              {success.refunded ? (
                <p>
                  <span className="font-medium text-success">
                    {t('unenroll.sorgsRefunded', { amount: success.refundAmount })}
                  </span>{" "}
                  {t('unenroll.toYourBalance')}
                </p>
              ) : (
                <p className="text-muted-foreground">{t('unenroll.noRefund')}</p>
              )}
              <p className="text-muted-foreground">
                {t.rich('unenroll.newBalance', { balance: success.newBalance, strong: (chunks) => <span className="font-medium text-foreground">{chunks}</span> })}
              </p>
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>{t('unenroll.done')}</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('unenroll.title', { name: gamerDisplayName })}</DialogTitle>
              <DialogDescription>
                {t.rich('unenroll.description', { gamer: gamerDisplayName, club: productName, strong: (chunks) => <strong>{chunks}</strong> })}
              </DialogDescription>
            </DialogHeader>

            {/* Refund messaging */}
            <div className="mt-2 space-y-3 rounded-md border border-border p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('unenroll.club')}</span>
                <span className="font-medium">{productName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('unenroll.gamer')}</span>
                <span className="font-medium">{gamerDisplayName}</span>
              </div>
              <div className="border-t border-border pt-3">
                {refundEligible ? (
                  <p className="text-success">
                    {t.rich('unenroll.refundEligible', { cost: tokenCost, strong: (chunks) => <strong>{chunks}</strong> })}
                  </p>
                ) : refundDenialReason === "within_window" ? (
                  <p className="flex items-start gap-2 text-warning">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      {t('unenroll.noRefundWithinWindow', { hours: ENROLLMENT_CHARGE_WINDOW_HOURS })}
                    </span>
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    {t('unenroll.noChargeNextSession')}
                  </p>
                )}
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={handleClose}
                disabled={unenroll.isPending}
              >
                {c('cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={handleUnenroll}
                disabled={unenroll.isPending}
              >
                {unenroll.isPending ? t('unenroll.unenrolling') : t('unenroll.confirmUnenroll')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
