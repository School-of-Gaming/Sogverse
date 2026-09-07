"use client";

import { useState } from "react";
import { Camera } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckboxRow } from "@/components/ui/checkbox-row";
import {
  ATTACHABLE_GAMER_PHOTO_CONSENT_TYPES,
  GAMER_PHOTO_CONSENT_ASKS,
  type AttachableGamerPhotoConsentType,
} from "@/lib/constants/gamer-photo-consents";
import { isGamerPhotoConsentGranted } from "@/lib/gamer-photo-consent-answer";
import { useSetGamerPhotoConsent } from "@/services/gamer-photo-consents";
import type { GamerPhotoConsent } from "@/types";

/**
 * **The one place a standing photo answer is both shown and changed.**
 *
 * The enrolment panel asks the same question, but it asks it blank every time —
 * a parent decides afresh for each enrolment, and the panel deliberately shows
 * no "you said yes on such a date" line. That leaves exactly one surface where
 * a parent can find out what is currently on file for their child and move it,
 * and this is it. The hint under the sentence is what joins the two halves: it
 * tells a parent the question is coming again and that the last answer wins, so
 * a blank box in a panel next month does not read as this card being forgotten.
 *
 * **Rendered for every child, whether or not any product has asked.** The
 * settings page shows the Lynx marketing row to every parent on the same
 * reasoning: a preference you can only find after you have been asked for it is
 * a preference nobody can withdraw in advance, and a parent who wants their
 * child out of photographs before enrolling has nowhere else to say so.
 *
 * **Each row saves on its own click, unlike the sign-in card next to it.** That
 * card batches into a submit because its writes mint and destroy credentials
 * and are not undone by clicking again. This one is a single boolean whose
 * opposite is one more click away, so a Save button would only add a step
 * between a parent's decision and it taking effect.
 *
 * **The card never renders from an unresolved read** — the page waits for the
 * rows before painting any of its cards, so the tick is the stored answer from
 * the first frame rather than a `false` that corrects itself into a `true` under
 * a reader's cursor. `consents` is nevertheless allowed to be `undefined` here,
 * because a *failed* read settles the page too: the marketing preferences take
 * the same position for the same reason, rendering unticked and usable rather
 * than dead, since what a parent clicks is written as clicked and cannot be
 * silently inverted by a baseline nobody could read.
 */
export function GamerPhotoConsentCard({
  gamerId,
  firstName,
  consents,
}: {
  gamerId: string;
  /** The child the sentences are written about, in the third person. */
  firstName: string;
  /** The stored rows, or `undefined` if the read failed. */
  consents: GamerPhotoConsent[] | undefined;
}) {
  const t = useTranslations("parent.gamerDetail.photoConsent");
  const setConsent = useSetGamerPhotoConsent();

  /**
   * The consent whose write is in flight, and the one that failed.
   *
   * A type rather than a boolean because the card renders a row per consent and
   * only the row a parent clicked should show itself busy — today's registry has
   * one entry and tomorrow's may not. `committing` is set *synchronously before*
   * `mutate` runs and cleared on settle, per the loading-state rule: the page
   * stays put after either outcome, so there is no unmount to clear it and the
   * flag has to be released by hand for the parent to be able to click again.
   */
  const [committing, setCommitting] =
    useState<AttachableGamerPhotoConsentType | null>(null);
  const [failed, setFailed] = useState<AttachableGamerPhotoConsentType | null>(
    null,
  );

  const handleChange = (
    consentType: AttachableGamerPhotoConsentType,
    granted: boolean,
  ) => {
    setCommitting(consentType);
    setFailed(null);
    setConsent.mutate(
      { gamerId, consentType, granted, source: "settings" },
      {
        onError: () => setFailed(consentType),
        onSettled: () => setCommitting(null),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          <CardTitle>{t("title")}</CardTitle>
        </div>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {ATTACHABLE_GAMER_PHOTO_CONSENT_TYPES.map((consentType) => (
          <div key={consentType} className="space-y-2">
            <CheckboxRow
              checked={isGamerPhotoConsentGranted(consents, consentType)}
              onCheckedChange={(next) => handleChange(consentType, next)}
              disabled={committing !== null}
              label={t.rich(
                `sentence.${GAMER_PHOTO_CONSENT_ASKS[consentType].sentenceKey}`,
                {
                  name: firstName,
                  // The registry owns where the tag points, so this surface and
                  // the enrolment panel cannot drift to two different policies
                  // for one sentence. A new tab, like the panel's document
                  // links and for the same reason one step removed: the page
                  // behind it is holding a toggle a parent is deciding about,
                  // and a navigation away would lose the card they came to.
                  privacy: (chunks) => (
                    <a
                      href={GAMER_PHOTO_CONSENT_ASKS[consentType].href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {chunks}
                    </a>
                  ),
                },
              )}
              hint={t("hint", { name: firstName })}
            />
            {/* Under the row it belongs to rather than at the foot of the card:
                with one row today the two positions look identical, and with two
                rows the foot would leave a parent guessing which click failed.
                It appears only after a click of theirs, so nothing already on
                screen moves on data's own schedule. */}
            {failed === consentType && (
              <p className="text-sm text-destructive">{t("saveFailed")}</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
