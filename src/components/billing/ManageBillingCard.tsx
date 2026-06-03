"use client";

import { useState } from "react";
import { CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type ManageBillingCardViewProps = {
  /** Fired when the user clicks "Manage billing". */
  onManage: () => void;
  /** True from the click until the page navigates away to Stripe. */
  isOpening: boolean;
  /** Localized error copy when the portal session couldn't be created. */
  error?: string | null;
};

/**
 * Pure prop-driven view. Used directly by /admin/ui-components to render
 * deterministic demos of each state.
 */
export function ManageBillingCardView({
  onManage,
  isOpening,
  error,
}: ManageBillingCardViewProps) {
  const t = useTranslations("parent.billing.manage");

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
        <Button onClick={onManage} disabled={isOpening} size="lg" className="gap-2">
          {isOpening ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ExternalLink className="h-4 w-4" />
          )}
          {isOpening ? t("opening") : t("cta")}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * Billing section of the parent dashboard. A single "Manage billing" button
 * that opens Stripe's Customer Portal — payment methods, invoices, and
 * subscriptions all live on Stripe, not on our site.
 *
 * The committing-state pattern (local `opening` flag set synchronously before
 * the fetch and never cleared on success) keeps the button disabled across the
 * network round-trip AND the full-page navigation to Stripe, so a fast user
 * can't fire two portal sessions. See CLAUDE.md "Loading & Disabled State".
 * The full-page `window.location.href` (not `router.push`) is deliberate —
 * we're leaving the app for an external origin.
 */
export function ManageBillingCard() {
  const t = useTranslations("parent.billing.manage");
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleManage = async () => {
    if (opening) return;
    setOpening(true);
    setError(null);
    try {
      const response = await fetch("/api/parent/billing-portal", {
        method: "POST",
      });
      if (!response.ok) {
        setError(t("error"));
        setOpening(false);
        return;
      }
      const { url } = await response.json();
      // Leave `opening` set — the document unloads on navigation.
      window.location.href = url;
    } catch {
      setError(t("error"));
      setOpening(false);
    }
  };

  return (
    <ManageBillingCardView
      onManage={handleManage}
      isOpening={opening}
      error={error}
    />
  );
}
