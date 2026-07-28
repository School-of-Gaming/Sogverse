"use client";

import { useState } from "react";
import { CreditCard, ExternalLink, Info, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { BillingService, type BillingAccount } from "@/services/billing";

/** One portal button's worth of already-localized copy. */
export interface BillingAccountSummary {
  /** The Stripe customer this button opens. Also the button's React key. */
  stripeCustomerId: string;
  /** One line per subscription billed here — "{child} · {club}". */
  covers: string[];
}

export type ManageBillingCardViewProps = {
  /**
   * The viewer's Stripe billing accounts. Zero or one renders exactly the
   * single unlabelled "Manage billing" button — the standard case, and what
   * every parent who has only ever bought through this site sees. More than one
   * renders a labelled button each, under a line explaining the split.
   */
  accounts: BillingAccountSummary[];
  /**
   * Fired with the Stripe customer to open, or `null` to let the server pick
   * the caller's own (and provision one if they have never purchased).
   */
  onManage: (stripeCustomerId: string | null) => void;
  /** True from the click until the page navigates away. Disables every button. */
  isOpening: boolean;
  /**
   * Which account's button shows the spinner. Irrelevant in the single-button
   * case, where `isOpening` already identifies the only button there is.
   */
  openingAccountId?: string | null;
  /** Localized error copy when the portal session couldn't be created. */
  error?: string | null;
};

/**
 * Pure prop-driven view. Used directly by /admin/ui-components to render
 * deterministic demos of each state.
 */
export function ManageBillingCardView({
  accounts,
  onManage,
  isOpening,
  openingAccountId = null,
  error,
}: ManageBillingCardViewProps) {
  const t = useTranslations("parent.billing.manage");
  const split = accounts.length > 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-6">
        {split ? (
          <>
            {/* Only shown when there really are several accounts, so the
                standard case never has to read an explanation for something
                it isn't seeing. */}
            <div className="flex items-start gap-2 self-stretch text-left text-sm text-muted-foreground">
              <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{t("splitExplanation")}</p>
            </div>
            {accounts.map((account) => (
              <Button
                key={account.stripeCustomerId}
                onClick={() => onManage(account.stripeCustomerId)}
                disabled={isOpening}
                size="lg"
                className="h-auto w-full max-w-sm flex-col gap-1 py-3"
              >
                <span className="flex items-center gap-2">
                  {isOpening && openingAccountId === account.stripeCustomerId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4" />
                  )}
                  {t("cta")}
                </span>
                <span className="flex flex-col text-xs font-normal opacity-90">
                  {account.covers.length > 0 ? (
                    account.covers.map((line) => <span key={line}>{line}</span>)
                  ) : (
                    <span>{t("coversFallback")}</span>
                  )}
                </span>
              </Button>
            ))}
          </>
        ) : (
          <Button
            onClick={() => onManage(accounts[0]?.stripeCustomerId ?? null)}
            disabled={isOpening}
            size="lg"
            className="gap-2"
          >
            {isOpening ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            {isOpening ? t("opening") : t("cta")}
          </Button>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * Billing section of the parent dashboard. A "Manage billing" button that opens
 * Stripe's Customer Portal — payment methods, invoices, and subscriptions all
 * live on Stripe, not on our site.
 *
 * A Stripe portal session is scoped to exactly one customer, so a parent who
 * owns several (see `services/billing`) needs one button each. `accounts`
 * arrives from the dashboard's Server Component rather than a client fetch
 * precisely so the button count is right on the first frame — resolving it
 * after paint would turn one rendered button into three under the parent's
 * cursor, which the "rendered content must not move" rule forbids.
 *
 * The committing-state pattern (local `opening` flag set synchronously before
 * the fetch and never cleared on success) keeps the buttons disabled across the
 * network round-trip AND the full-page navigation to Stripe, so a fast user
 * can't fire two portal sessions. See CLAUDE.md "Loading & Disabled State".
 * The full-page `window.location.href` (not `router.push`) is deliberate —
 * we're leaving the app for an external origin.
 */
export function ManageBillingCard({
  accounts,
}: {
  accounts: BillingAccount[];
}) {
  const t = useTranslations("parent.billing.manage");
  const locale = resolveLocale(useLocale());
  const [opening, setOpening] = useState(false);
  const [openingAccountId, setOpeningAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const summaries: BillingAccountSummary[] = accounts.map((account) => ({
    stripeCustomerId: account.stripeCustomerId,
    covers: account.covers.map((cover) => {
      const productName =
        resolveTranslation(cover.productTranslations, locale)?.name ?? "";
      // A gamer profile can legitimately have no first name; the club alone
      // still identifies which subscription this account pays for.
      return cover.gamerFirstName
        ? t("coversItem", { name: cover.gamerFirstName, product: productName })
        : productName;
    }),
  }));

  const handleManage = async (stripeCustomerId: string | null) => {
    if (opening) return;
    setOpening(true);
    setOpeningAccountId(stripeCustomerId);
    setError(null);
    try {
      const url = await new BillingService().createPortalSession(
        stripeCustomerId ? { stripeCustomerId } : {},
      );
      // Leave `opening` set — the document unloads on navigation.
      window.location.href = url;
    } catch {
      setError(t("error"));
      setOpening(false);
      setOpeningAccountId(null);
    }
  };

  return (
    <ManageBillingCardView
      accounts={summaries}
      onManage={handleManage}
      isOpening={opening}
      openingAccountId={openingAccountId}
      error={error}
    />
  );
}
