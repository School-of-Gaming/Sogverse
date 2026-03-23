"use client";

import { useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
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
      setError(err instanceof Error ? err.message : "Failed to unenroll");
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
                Unenrolled
              </DialogTitle>
              <DialogDescription>
                <strong>{gamerDisplayName}</strong> has been unenrolled
                from <strong>{productName}</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2 space-y-3 rounded-md border border-border p-4 text-sm">
              {success.refunded ? (
                <p>
                  <span className="font-medium text-success">
                    {success.refundAmount} Sorgs refunded
                  </span>{" "}
                  to your balance.
                </p>
              ) : (
                <p className="text-muted-foreground">No refund was issued.</p>
              )}
              <p className="text-muted-foreground">
                New balance: <span className="font-medium text-foreground">{success.newBalance} Sorgs</span>
              </p>
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Unenroll {gamerDisplayName}?</DialogTitle>
              <DialogDescription>
                This will remove{" "}
                <strong>{gamerDisplayName}</strong> from{" "}
                <strong>{productName}</strong>.
              </DialogDescription>
            </DialogHeader>

            {/* Refund messaging */}
            <div className="mt-2 space-y-3 rounded-md border border-border p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Club</span>
                <span className="font-medium">{productName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Gamer</span>
                <span className="font-medium">{gamerDisplayName}</span>
              </div>
              <div className="border-t border-border pt-3">
                {refundEligible ? (
                  <p className="text-success">
                    You will receive a refund of{" "}
                    <strong>{tokenCost} Sorgs</strong>.
                  </p>
                ) : refundDenialReason === "within_window" ? (
                  <p className="flex items-start gap-2 text-warning">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      No refund will be issued — the next session is within{" "}
                      {ENROLLMENT_CHARGE_WINDOW_HOURS} hours.
                    </span>
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    You won&apos;t be charged for the next session.
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
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleUnenroll}
                disabled={unenroll.isPending}
              >
                {unenroll.isPending ? "Unenrolling..." : "Confirm Unenroll"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
