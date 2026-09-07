"use client";

import { Camera } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ATTACHABLE_GAMER_PHOTO_CONSENT_TYPES } from "@/lib/constants/gamer-photo-consents";
import { findGamerPhotoConsentRow } from "@/lib/gamer-photo-consent-answer";
import { useGamerPhotoConsents } from "@/services/gamer-photo-consents";
import { useTimezone } from "@/providers";
import { formatDate } from "@/lib/utils";

/**
 * What a gamer's parent has said about photographs of them.
 *
 * The twin of the marketing card's preferences block with the subject changed
 * from an adult's mailbox to a child's image, and read-only for a stricter
 * reason than that one. There, an admin cannot answer because the consent
 * belongs to whoever owns the mailbox; here `set_gamer_photo_consent` is
 * guard-first on `assert_role('customer')` and additionally refuses unless a
 * `parent_gamer` row links the caller to the child — so there is no writer for
 * an admin to reach even in principle, and none should be built. What an admin
 * needs is to be able to *see* the answer when a parent phones about a photo,
 * and the admin SELECT policy on `gamer_photo_consents` is what makes that
 * readable.
 *
 * **An absent row reads as not granted, and the date is what separates them.**
 * Never asked and answered-no are different facts in the database and the same
 * fact for a photographer, so the badge collapses them; a row carries the moment
 * the parent last moved the toggle and an absent one carries nothing, which
 * tells an admin which of the two they are looking at without a second label.
 *
 * **Rendered from the registry rather than from the rows**, so a consent nobody
 * has ever answered still has a line. A card that listed only stored rows would
 * show an empty space where "not granted" belongs, and the admin details-page
 * rule is exactly that a property nobody can see is a property nobody audits.
 */
export function UserGamerPhotoConsentCard({ gamerId }: { gamerId: string }) {
  const t = useTranslations("admin.users.photoConsent");
  const locale = useLocale();
  const timeZone = useTimezone();
  const { data: consents } = useGamerPhotoConsents(gamerId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-act" />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Two abreast from `sm`, matching the marketing card's preferences
            grid: an admin surface is desktop-default, and one-line rows stacked
            down the middle of a wide page is the layout that rule prevents. */}
        <div className="grid gap-3 sm:grid-cols-2">
          {ATTACHABLE_GAMER_PHOTO_CONSENT_TYPES.map((consentType) => {
            const row = findGamerPhotoConsentRow(consents, consentType);
            return (
              <div
                key={consentType}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <p className="min-w-0 truncate text-sm font-medium">
                  {t(`labels.${consentType}`)}
                </p>
                {/* One right-packed group whose row height is already set by the
                    label, so this arriving a round trip after first paint grows
                    leftward into the row's own slack and moves nothing. Nothing
                    is rendered while the read is unresolved: a card that said
                    "not granted" and then corrected itself would be stating a
                    safeguarding fact it did not have. */}
                {consents !== undefined && (
                  <div className="flex shrink-0 items-center gap-2">
                    {row && (
                      <span className="text-xs text-muted-foreground">
                        {t("since", {
                          // A timestamptz instant, so it renders in the viewer's
                          // own zone rather than the runtime default.
                          date: formatDate(row.updated_at, locale, {
                            dateStyle: "medium",
                            timeZone,
                          }),
                        })}
                      </span>
                    )}
                    {/* The marketing card's badge, verbatim: an outline badge
                        carrying the answer as ink. Two admin cards sitting one
                        above the other on the same user page have to read as one
                        thing, and a filled badge here beside an outlined one
                        there would say the two answers were different kinds of
                        fact. `muted` was never a token the theme defined, so the
                        fill this replaces rendered as no fill at all. */}
                    <Badge
                      variant="outline"
                      className={
                        row?.granted ? "text-success" : "text-muted-foreground"
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
