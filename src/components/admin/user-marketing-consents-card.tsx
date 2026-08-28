"use client";

import { Megaphone } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMarketingConsentsForCustomer } from "@/services/marketing-consents";
import { useTimezone } from "@/providers";
import { formatDate } from "@/lib/utils";
import type { MarketingConsentType } from "@/types";

/**
 * The order the two consents are read in, written out rather than derived.
 * Postgres orders an enum by declaration order and a select returns rows in no
 * order at all, so neither says anything about how a person should read them.
 * Our own mailing list first, the partner's second — the same order the parent
 * sees on their own settings page.
 */
const CONSENT_ORDER = [
  "school_of_gaming",
  "lynx_educate",
] as const satisfies readonly MarketingConsentType[];

/**
 * What a parent currently says about marketing, on their admin detail page.
 *
 * **Read-only, and that is the design rather than a first cut.** The consent
 * belongs to whoever owns the mailbox: `set_marketing_consent` takes no subject
 * parameter and is guard-first on `assert_role('customer')`, so an admin has no
 * way to answer on a family's behalf and no UI here should imply one. What an
 * admin needs is to be able to *see* the answer — when a parent phones to ask
 * why they are still getting mail, or why they are not — and the admin SELECT
 * policy on `marketing_consents` is what makes that readable.
 *
 * **An absent row reads as not granted.** The two states differ in the database
 * (never asked, versus answered no) and they do not differ in what may be sent,
 * which is the question this card answers. The `since` line is what separates
 * them on screen without a second label: a row carries the moment the parent
 * last moved the toggle, and no row carries nothing.
 */
export function UserMarketingConsentsCard({
  customerId,
}: {
  customerId: string;
}) {
  const t = useTranslations("admin.users.marketing");
  const locale = useLocale();
  const timeZone = useTimezone();
  const { data: consents } = useMarketingConsentsForCustomer(customerId);

  const labels: Record<MarketingConsentType, string> = {
    school_of_gaming: t("schoolOfGaming"),
    lynx_educate: t("lynxEducate"),
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary" />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Two abreast from `sm`: an admin surface is desktop-default, and two
            one-line rows stacked down the middle of a wide page is the layout
            that rule exists to prevent. */}
        <div className="grid gap-3 sm:grid-cols-2">
          {CONSENT_ORDER.map((consentType) => {
            const row = consents?.find(
              (candidate) => candidate.consent_type === consentType,
            );
            return (
              <div
                key={consentType}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <p className="min-w-0 truncate text-sm font-medium">
                  {labels[consentType]}
                </p>
                {/* The answer is one right-packed group and the row's height is
                    already set by the label, so this arriving a round trip after
                    first paint grows leftward into the row's own slack and moves
                    nothing. That is why nothing is rendered here while the read
                    is unresolved: a card that said "not granted" and then
                    corrected itself would be stating a fact it did not have. */}
                {consents !== undefined && (
                  <div className="flex shrink-0 items-center gap-2">
                    {row && (
                      <span className="text-xs text-muted-foreground">
                        {t("since", {
                          // A timestamptz instant, so it renders in the
                          // viewer's own zone rather than the runtime default.
                          date: formatDate(row.updated_at, locale, {
                            dateStyle: "medium",
                            timeZone,
                          }),
                        })}
                      </span>
                    )}
                    <Badge
                      className={
                        row?.granted
                          ? "bg-success text-success-foreground"
                          : "bg-muted text-muted-foreground"
                      }
                    >
                      {row?.granted ? t("granted") : t("notGranted")}
                    </Badge>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
