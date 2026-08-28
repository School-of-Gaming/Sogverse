"use client";

import { useState } from "react";
import { Megaphone } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useMyMarketingConsents,
  useSetMarketingConsent,
} from "@/services/marketing-consents";
import type { MarketingConsentType } from "@/types";

/**
 * The order the two consents are rendered in, written out rather than read off
 * the enum or off the rows.
 *
 * Postgres orders an enum by *declaration* order and a select returns whatever
 * order it likes, so neither is a promise about what a parent should read first.
 * This is: our own mailing list, then the partner's.
 */
const CONSENT_ORDER = [
  "school_of_gaming",
  "lynx_educate",
] as const satisfies readonly MarketingConsentType[];

/**
 * A parent's optional, revocable marketing consents, edited from their own
 * settings page.
 *
 * **Each toggle commits immediately** — there is no Save button and nothing to
 * submit. That is what the underlying system is shaped for: the consent is
 * account-level and revocable, the RPC is idempotent, and the append-only event
 * log records only actual changes, so a tick *is* the answer rather than a draft
 * of one. Batching them behind a Save would leave a parent who unticked a box
 * and navigated away still on the mailing list.
 *
 * **Nothing is writable until the read lands.** A checkbox seeded from an
 * unresolved read is seeded from `false`, so a parent who is already opted in
 * and clicks before the rows arrive would send `true` for a state already on
 * file — the RPC would treat it as a no-op and the box would spring back. Both
 * boxes are therefore disabled until `consents` is defined. There is no
 * skeleton and no spinner for that wait: it is at most two rows read by
 * primary-key prefix, the card is at its final size from the first frame, and
 * the only thing that changes when the answer lands is which boxes are ticked.
 */
export function MarketingPreferencesCard() {
  const t = useTranslations("settings.marketing");
  const { data: consents } = useMyMarketingConsents();
  const setConsent = useSetMarketingConsent();

  /**
   * Which consents have a write in flight, set synchronously before `mutate()`
   * and cleared on **both** outcomes — the parent stays on this page whatever
   * happens, so there is no unmount to hand the flag off to and a failed write
   * has to leave a box they can try again.
   *
   * Per consent rather than one flag for the card: the two boxes are
   * independent answers, and disabling the other one because this one is saving
   * would be the card inventing a relationship the data does not have.
   */
  const [committing, setCommitting] = useState<readonly MarketingConsentType[]>(
    [],
  );
  const [failed, setFailed] = useState(false);

  const granted = (consentType: MarketingConsentType) =>
    consents?.some((row) => row.consent_type === consentType && row.granted) ??
    false;

  const handleToggle = (consentType: MarketingConsentType, next: boolean) => {
    // Live before any render after the click.
    setCommitting((current) => [...current, consentType]);
    setFailed(false);
    setConsent.mutate(
      { consentType, granted: next, source: "settings" },
      {
        // The revert on failure is the invalidation's job on the success path
        // and the *absence* of one here: the box is rendered from server state
        // rather than from a local copy, so a write that never landed leaves it
        // showing what is still on file.
        onError: () => setFailed(true),
        onSettled: () =>
          setCommitting((current) =>
            current.filter((type) => type !== consentType),
          ),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5" />
          <CardTitle>{t("title")}</CardTitle>
        </div>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {CONSENT_ORDER.map((consentType) => (
          <label
            key={consentType}
            className="flex items-start gap-2 text-sm cursor-pointer"
          >
            <Checkbox
              className="mt-0.5"
              checked={granted(consentType)}
              onChange={(e) => handleToggle(consentType, e.target.checked)}
              disabled={
                consents === undefined || committing.includes(consentType)
              }
            />
            <span>
              {consentType === "school_of_gaming" ? (
                t("schoolOfGaming")
              ) : (
                /* An anchor off the app's own chrome, which the
                   no-off-site-links rule permits: that rule governs
                   staff-authored copy written to one family, and this is a
                   consent sentence naming the partner it is about. A parent
                   being asked to share their address with Lynx Educate has to
                   be able to go and look at who that is. */
                <>
                  {t.rich("lynxEducate", {
                    link: (chunks) => (
                      <a
                        href="https://lynxeducate.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-foreground"
                      >
                        {chunks}
                      </a>
                    ),
                  })}
                </>
              )}
            </span>
          </label>
        ))}

        {/* Last in the card, so its arrival pushes nothing that was already on
            screen down — the failure is the one thing here that appears after
            first paint, and the end of the run is where the layout's slack
            already sits. Keep it last if this card grows. */}
        {failed && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {t("saveFailed")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
