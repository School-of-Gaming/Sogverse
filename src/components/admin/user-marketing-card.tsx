"use client";

import { Megaphone } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMarketingConsentsForCustomer } from "@/services/marketing-consents";
import { useTimezone } from "@/providers";
import { formatDate } from "@/lib/utils";
import type { UtmAttribution } from "@/lib/utm";
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

/** The three attribution fields, in the order a campaign link spells them. */
const ATTRIBUTION_ORDER = ["source", "medium", "campaign"] as const;

/**
 * Everything the admin detail page has to say about marketing, in one card:
 * where the account came from, and what its holder has since agreed to.
 *
 * **One card because they are one subject, not because they share a shape.**
 * They are read together — an admin looking at a campaign's accounts and an
 * admin answering "why am I still getting mail" are the same person on the same
 * page — and the attribution used to sit inside the profile summary card, where
 * it was the only marketing fact on the page filed under identity.
 *
 * ---------------------------------------------------------------------------
 * ATTRIBUTION
 * ---------------------------------------------------------------------------
 *
 * Where the account came from: the UTM values a marketing link carried,
 * captured once at registration.
 *
 * **Read-only, and structurally so.** The three columns have no UPDATE grant,
 * so an admin cannot change them through the app whatever this page offered —
 * see `src/lib/utm.ts` for the constraints the whole feature is built to, of
 * which write-once is one.
 *
 * **All three rows, always, empty ones included.** This is the admin
 * details-page rule doing its work: a property nobody can see is a property
 * nobody audits, and a block that hid the null fields made "this account has no
 * medium" and "this page does not show mediums" look identical. Gamer rows are
 * NULL by construction, which is why a gamer never sees this card at all rather
 * than seeing three empty rows.
 *
 * ---------------------------------------------------------------------------
 * PREFERENCES
 * ---------------------------------------------------------------------------
 *
 * What a parent currently says about marketing.
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
 * which is the question this block answers. The `since` line is what separates
 * them on screen without a second label: a row carries the moment the parent
 * last moved the toggle, and no row carries nothing.
 *
 * **Absent entirely for a gedu.** Only a customer can hold a marketing consent,
 * so an educator's card is the attribution block alone — an empty pair of tiles
 * would be a question we never asked them rather than an answer they never
 * gave.
 */
export function UserMarketingCard({
  attribution,
  customerId,
}: {
  /** The three UTM columns as the server read them, nulls included. */
  attribution: UtmAttribution;
  /**
   * Whose consents to show, or `null` for a role that holds none. The gate is
   * on the id rather than on a separate flag so there is no way to ask for the
   * block without naming whose answer it is.
   */
  customerId: string | null;
}) {
  const t = useTranslations("admin.users.marketing");
  const c = useTranslations("common");
  const locale = useLocale();
  const timeZone = useTimezone();
  // The hook already declines to fetch without an id (`enabled: !!customerId`),
  // so the empty string is a query that never runs rather than a query for
  // nobody — and the block it feeds is not rendered in that case either.
  const { data: consents } = useMarketingConsentsForCustomer(customerId ?? "");

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
      <CardContent className="space-y-6">
        <section>
          {/* Furniture, not voice: a small tracked marker a reader scans as
              structure. Both sub-headings are styled identically and case
              together — de-capping one would read as a rendering fault beside
              the other. */}
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("attribution")}
          </h3>
          <dl className="mt-2 flex flex-col gap-1.5">
            {ATTRIBUTION_ORDER.map((field) => {
              const value = attribution[field];
              return (
                <div key={field} className="flex items-center gap-2 text-sm">
                  <dt className="text-muted-foreground">{t(`utm.${field}`)}</dt>
                  {value === null ? (
                    <dd className="text-muted-foreground">{c("notSet")}</dd>
                  ) : (
                    // Value-chip treatment matching the instant voice room's
                    // compact RoomLinkChip, so machine-authored values read as
                    // machine-authored site-wide. `break-all` because a UTM
                    // value can be an expanded ad name of up to 200 characters
                    // with no break opportunity in it.
                    <dd className="break-all rounded-md border border-border bg-muted/50 px-2 py-0.5 font-mono font-semibold">
                      {value}
                    </dd>
                  )}
                </div>
              );
            })}
          </dl>
        </section>

        {customerId !== null && (
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("preferences")}
            </h3>
            {/* Two abreast from `sm`: an admin surface is desktop-default, and
                two one-line rows stacked down the middle of a wide page is the
                layout that rule exists to prevent. */}
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
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
                    {/* The answer is one right-packed group and the row's height
                        is already set by the label, so this arriving a round
                        trip after first paint grows leftward into the row's own
                        slack and moves nothing. That is why nothing is rendered
                        here while the read is unresolved: a card that said "not
                        granted" and then corrected itself would be stating a
                        fact it did not have. */}
                    {consents !== undefined && (
                      <div className="flex shrink-0 items-center gap-2">
                        {row && (
                          <span className="text-xs text-muted-foreground">
                            {t("since", {
                              // A timestamptz instant, so it renders in the
                              // viewer's own zone rather than the runtime
                              // default.
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
          </section>
        )}
      </CardContent>
    </Card>
  );
}
