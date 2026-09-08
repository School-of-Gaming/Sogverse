"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { resolveLocale } from "@/lib/constants/locales";
import { isSupportedCurrency } from "@/lib/constants/currency";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { cn, formatCurrencyFromCents } from "@/lib/utils";
import { useProductsByType } from "@/services/products";
import {
  SwitchClubCommitError,
  useSwitchClub,
  useSwitchClubCheck,
} from "@/services/participations";
import type { SwitchClubRefusal } from "@/services/participations/switch-club.contracts";
import {
  isSwitchTarget,
  switchTargetWarnings,
  type SwitchTargetWarning,
} from "./panel-rules";

// Refusal → message key. A total map rather than a chain, exactly as the
// blocked-move dialog's: a ninth refusal added to the contract then fails to
// compile until its copy exists, instead of falling through to whichever branch
// happened to be last. `as const satisfies` keeps the literal types, which is
// what lets next-intl check each key against the message tree.
const REFUSAL_KEY = {
  latest_invoice_not_paid: "latestInvoiceNotPaid",
  subscription_not_single_item: "subscriptionNotSingleItem",
  no_target_price_in_currency: "noTargetPriceInCurrency",
  participation_not_active: "participationNotActive",
  no_live_subscription: "noLiveSubscription",
  target_not_paid_subscription_club: "targetNotPaidSubscriptionClub",
  same_product: "sameProduct",
  already_on_target: "alreadyOnTarget",
} as const satisfies Record<SwitchClubRefusal, string>;

const WARNING_KEY = {
  ageExcluded: "ageExcluded",
  regionLocked: "regionLocked",
  notStarted: "notStarted",
} as const satisfies Record<SwitchTargetWarning, string>;

interface SwitchClubDialogProps {
  /** The product the seat is on today — half of the route's path. */
  productId: string;
  participationId: string;
  /** The seat holder's first name, woven into the dialog's description. */
  gamerName: string;
  /**
   * The seated child's age, or null when the seat carries no date of birth (an
   * adult seat). Resolved by the caller from the same snapshot that drew the
   * chip, so the picker's age warnings and the chip's age line agree.
   */
  childAge: number | null;
  /**
   * Told whenever the commit starts or fails, so the panel can mark the chip
   * busy for as long as money is moving. Not derived from the mutation's own
   * pending flag: that clears before the dialog closes, and a chip that
   * un-greys a frame early is a chip an admin can start dragging mid-switch.
   */
  onCommittingChange: (committing: boolean) => void;
  onClose: () => void;
}

/**
 * Move a subscribed seat to another consumer club, swapping the family's Stripe
 * subscription onto that club's canonical price in the same action.
 *
 * The dialog asks two things of the server and shows both: the picker's rows
 * are warnings derived on this side from data already on screen (see
 * `switchTargetWarnings` in ./panel-rules), and the money block underneath is
 * the check route's answer — the amount the family pays today, the target's
 * price, and whether anything hard refuses. Warnings never disable the confirm;
 * refusals always do, because every one of them is a state that has to be
 * settled in Stripe before a switch can mean anything.
 */
export function SwitchClubDialog({
  productId,
  participationId,
  gamerName,
  childAge,
  onCommittingChange,
  onClose,
}: SwitchClubDialogProps) {
  const t = useTranslations("admin.products.groupsPanel.switchClub");
  const c = useTranslations("common");
  const uiLocale = resolveLocale(useLocale());

  const [targetId, setTargetId] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [failure, setFailure] = useState<SwitchClubCommitError | null>(null);

  // One request id for the life of this dialog, minted in a lazy initializer so
  // it survives every re-render (and a double-invoked render in development).
  // Every press in this dialog carries it, which is what makes a retry after a
  // timeout or a failed database step replay one Stripe request rather than
  // prorate twice; a fresh dialog is a fresh id, and the route's no-op item
  // update is the second line of defence there.
  const [requestId] = useState(() => crypto.randomUUID());

  const { data: products, isLoading: productsLoading } =
    useProductsByType("consumer_club");
  const check = useSwitchClubCheck(productId, participationId, targetId);
  const commit = useSwitchClub(productId, participationId);

  const targets = useMemo(() => {
    const rows = (products ?? [])
      .filter((p) => isSwitchTarget(p, productId))
      .map((p) => ({
        id: p.id,
        name: resolveTranslation(p.product_translations, uiLocale)?.name ?? "",
        warnings: switchTargetWarnings(
          {
            status: p.status,
            minAge: p.min_age,
            maxAge: p.max_age,
            regionLockCountry: p.region_lock_country,
          },
          childAge,
        ),
      }));
    return rows.sort((a, b) => a.name.localeCompare(b.name, uiLocale));
  }, [products, productId, uiLocale, childAge]);

  const refusals = check.data?.refusals ?? [];
  // A 400 carrying refusals is a gate that moved under the admin between the
  // check and the press; it kills the confirm until they pick another club.
  const commitRefusals = failure?.refusals ?? [];
  // The one failure the admin can act on from here: Stripe is already on the
  // new price and the database step did not run, so pressing again replays the
  // same request and finishes the move.
  const retryable = failure?.stripeUpdated === true;
  const answered =
    targetId !== null &&
    check.data !== undefined &&
    refusals.length === 0 &&
    commitRefusals.length === 0;
  const confirmDisabled = committing || !(answered || retryable);

  const handleConfirm = () => {
    if (targetId === null) return;
    // Live before any render after the click, and cleared only where the admin
    // has to press again — the success path closes the dialog, and the unmount
    // is what ends the state there.
    setCommitting(true);
    onCommittingChange(true);
    setFailure(null);
    commit.mutate(
      { targetProductId: targetId, requestId },
      {
        onSuccess: () => {
          onCommittingChange(false);
          onClose();
        },
        onError: (error) => {
          setCommitting(false);
          onCommittingChange(false);
          setFailure(
            error instanceof SwitchClubCommitError
              ? error
              : new SwitchClubCommitError(t("commit.failed"), {}),
          );
        },
      },
    );
  };

  const handleSelect = (id: string) => {
    setTargetId(id);
    // The previous answer belonged to a different club, and so did any refusal
    // the press came back with.
    setFailure(null);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !committing && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description", { name: gamerName })}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("picker.label")}
          </p>
          {/* The list scrolls inside a fixed box: how many clubs are on the
              platform is not something the dialog's height should follow, and
              the money block below it must sit at the same place whatever the
              picker holds. */}
          <div className="h-48 overflow-y-auto rounded-lg border border-border p-1">
            {productsLoading ? (
              <div className="space-y-1 p-1">
                <div className="h-10 animate-pulse rounded-md bg-lifted" />
                <div className="h-10 animate-pulse rounded-md bg-lifted" />
                <div className="h-10 animate-pulse rounded-md bg-lifted" />
              </div>
            ) : targets.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                {t("picker.empty")}
              </p>
            ) : (
              <ul className="space-y-1">
                {targets.map((target) => (
                  <li key={target.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(target.id)}
                      disabled={committing}
                      aria-pressed={targetId === target.id}
                      className={cn(
                        "w-full rounded-md px-3 py-2 text-left text-sm transition-colors disabled:opacity-50",
                        targetId === target.id
                          ? "bg-lifted font-medium ring-2 ring-act"
                          : "hover:bg-hover",
                      )}
                    >
                      {target.name}
                      {target.warnings.length > 0 && (
                        <span className="mt-1 flex flex-col gap-0.5">
                          {target.warnings.map((warning) => (
                            <span
                              key={warning}
                              className="flex items-center gap-1 text-xs font-normal text-warning"
                            >
                              <AlertTriangle
                                className="h-3 w-3 shrink-0"
                                aria-hidden
                              />
                              {t(`warnings.${WARNING_KEY[warning]}`)}
                            </span>
                          ))}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* The money. A Stripe round trip fills this, so the skeleton is
              immediate and the box already stands at its final height —
              choosing a club, waiting, and reading the answer all happen
              without a pixel below it moving. */}
          <div className="h-36 overflow-y-auto rounded-lg border border-border p-3">
            {targetId === null ? (
              <p className="text-sm text-muted-foreground">
                {t("prices.selectPrompt")}
              </p>
            ) : check.isError ? (
              <p className="text-sm text-muted-foreground">
                {t("prices.error")}
              </p>
            ) : check.data === undefined ? (
              <div className="space-y-2">
                <div className="h-4 w-24 animate-pulse rounded bg-lifted" />
                <div className="h-7 w-56 animate-pulse rounded bg-lifted" />
                <div className="h-4 w-full animate-pulse rounded bg-lifted" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-lifted" />
              </div>
            ) : refusals.length > 0 ? (
              <ul className="space-y-2">
                {refusals.map((refusal) => (
                  <li
                    key={refusal}
                    className="flex items-start gap-2 text-sm text-foreground"
                  >
                    <AlertTriangle
                      className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                      aria-hidden
                    />
                    {t(`refusals.${REFUSAL_KEY[refusal]}`)}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="space-y-2">
                <div className="flex items-end gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("prices.current")}
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {formatAmount(
                        check.data.currentAmountCents,
                        check.data.currency,
                        uiLocale,
                      ) ?? t("prices.unavailable")}
                    </p>
                  </div>
                  <ArrowRight
                    className="mb-1.5 h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("prices.target")}
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {formatAmount(
                        check.data.targetAmountCents,
                        check.data.currency,
                        uiLocale,
                      ) ?? t("prices.unavailable")}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("prices.proration")}
                </p>
              </div>
            )}
          </div>

          {failure && (
            <Alert variant={failure.stripeUpdated ? "warning" : "destructive"}>
              <AlertDescription>
                {failure.stripeUpdated
                  ? t("commit.stripeUpdated")
                  : commitRefusals.length > 0
                    ? commitRefusals
                        .map((refusal) => t(`refusals.${REFUSAL_KEY[refusal]}`))
                        .join(" ")
                    : t("commit.failed")}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={committing}>
            {c("cancel")}
          </Button>
          {/* Present from open, so nothing lands in the footer after the fact —
              a late child would push the stacked row down. The check is what
              enables it, and the one exception is the retry: a commit that
              updated Stripe and then failed to move the row leaves this live so
              the admin can press again with the same request id. */}
          <Button onClick={handleConfirm} disabled={confirmDisabled}>
            {committing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One amount, in the subscription's own currency — null where there is nothing
 * to draw: a tiered price carries no flat amount, and a target with no authored
 * price in that currency has none either (which is also a hard refusal, so the
 * admin reads the reason rather than a blank).
 *
 * The currency is guarded rather than cast: it arrives as a bare string from
 * the wire, and the shared formatter's argument is the supported set on
 * purpose.
 */
function formatAmount(
  cents: number | null,
  currency: string,
  locale: string,
): string | null {
  if (cents === null || !isSupportedCurrency(currency)) return null;
  return formatCurrencyFromCents(cents, currency, locale);
}
