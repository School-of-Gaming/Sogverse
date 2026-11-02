"use client";

import { useTranslations } from "next-intl";
import { StatusLine } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/cn";
import { LYNX_EDUCATE_URL } from "@/lib/constants/marketing-consents";
import type { MarketingConsentType } from "@/types";

/**
 * The consents a parent answers here, in the order they are rendered, written
 * out rather than read off the enum or off the stored rows. Exported because
 * the card that saves them walks the same list.
 *
 * Only the partner's: School of Gaming's own mailing list is answered in
 * Klaviyo, and Sogverse keeps only what the parent said at registration.
 */
export const MARKETING_CONSENT_ORDER = [
  "lynx_educate",
] as const satisfies readonly MarketingConsentType[];

/**
 * School of Gaming's own email marketing as the box can show it: Klaviyo's
 * answer once it lands, or which of the two reasons there is none yet. Never a
 * guessed `false` — a box shown unticked for a parent who is subscribed would
 * invite a save that changes something they never meant to touch.
 */
export type SchoolOfGamingEmailState = "loading" | "failed" | { subscribed: boolean };

/** The School of Gaming box's id, a constant so its label can name it. */
const SCHOOL_OF_GAMING_FIELD_ID = "settings-school-of-gaming-email";

/**
 * **A parent's optional, revocable marketing consents — as a group of fields
 * inside the Profile card, not a card of its own.**
 *
 * It used to be a standalone card that committed each tick immediately. That
 * made it the settings page's only auto-saver: every other control there — the
 * name fields, the phone, the spoken languages, the home location — is edited
 * freely and committed by the Profile card's Save button, so a page where one
 * group silently wrote on click and the rest waited for a button taught two
 * contradictory models at once. The consents now live inside that card, above
 * the location field, and are saved by the same button.
 *
 * **Purely presentational, and controlled.** It holds no query and no mutation:
 * the card above owns the seed, the local edits and the writes, which is what
 * lets it decide that a save commits only the consents that actually changed.
 *
 * **The shape is the spoken-languages group's**, deliberately — a `fieldset`
 * with a `legend` naming the group, then one plain checkbox-and-sentence row per
 * answer. Not the shared `CheckboxRow`: inside a form the form's own idiom wins,
 * and bordering two rows here would make them the only boxed controls on a page
 * of bare fields. The rows do sit `items-start` where the languages sit
 * centred, because these sentences wrap and a box centred on a two-line sentence
 * floats away from the words it answers.
 *
 * No description line. The group sits inside a form the reader is already
 * editing, and the sentences say what each tick does; the spoken-languages group
 * beside it introduces itself with its legend alone.
 */
export function MarketingPreferencesFields({
  schoolOfGaming,
  onSchoolOfGamingChange,
  onSchoolOfGamingRetry,
  granted,
  onChange,
  disabled,
}: {
  /**
   * School of Gaming's own email marketing, read live from Klaviyo — a
   * third-party round trip, so the box is a skeleton until it lands, and a
   * failed read leaves it unclickable with a retry rather than a guess.
   */
  schoolOfGaming: SchoolOfGamingEmailState;
  onSchoolOfGamingChange: (next: boolean) => void;
  onSchoolOfGamingRetry: () => void;
  /** Whether each consent is currently ticked, saved value plus any local edit. */
  granted: (consentType: MarketingConsentType) => boolean;
  onChange: (consentType: MarketingConsentType, next: boolean) => void;
  /**
   * True until the stored answers land, and again while a save is in flight.
   *
   * The first half matters more than it looks: a box seeded from an unresolved
   * read is seeded from `false`, so an already-opted-in parent could otherwise
   * tick a box they had already ticked and watch it spring back when the answer
   * arrived.
   */
  disabled: boolean;
}) {
  const t = useTranslations("settings.marketing");
  const failed = schoolOfGaming === "failed";
  const answered = typeof schoolOfGaming === "object";

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium leading-none">{t("title")}</legend>
      <div className="flex flex-col gap-2">
        {/* Our own list first, the partner's after it. The label and the note
            are bundled copy and paint at once; only the box waits on Klaviyo,
            and its ghost is the box's own size, so nothing moves when the
            answer lands. A row of its own rather than a wrapping `label`: the
            retry inside it must not become what the label clicks. */}
        <div className="flex items-start gap-2 text-sm">
          {answered ? (
            <Checkbox
              id={SCHOOL_OF_GAMING_FIELD_ID}
              className="mt-0.5"
              checked={schoolOfGaming.subscribed}
              onChange={(e) => onSchoolOfGamingChange(e.target.checked)}
              disabled={disabled}
            />
          ) : (
            <span
              data-testid="school-of-gaming-email-ghost"
              aria-hidden
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0 rounded-sm bg-lifted",
                !failed && "animate-pulse",
              )}
            />
          )}
          <div className="min-w-0">
            <label
              htmlFor={SCHOOL_OF_GAMING_FIELD_ID}
              className={cn(answered && !disabled && "cursor-pointer")}
            >
              {t("schoolOfGaming")}
            </label>
            {/* The note and the failure share one grid cell, the hidden one
                still holding its height, so a failed read swaps one line for
                the other without moving the partner's row below. */}
            <div className="grid">
              <p
                className={cn(
                  "col-start-1 row-start-1 text-muted-foreground",
                  failed && "invisible",
                )}
              >
                {t("schoolOfGamingNote")}
              </p>
              <StatusLine
                status="destructive"
                className={cn("col-start-1 row-start-1", !failed && "invisible")}
              >
                {t("schoolOfGamingLoadFailed")}{" "}
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-sm"
                  onClick={onSchoolOfGamingRetry}
                >
                  {t("retry")}
                </Button>
              </StatusLine>
            </div>
          </div>
        </div>
        {MARKETING_CONSENT_ORDER.map((consentType) => (
          <label
            key={consentType}
            className="flex items-start gap-2 text-sm cursor-pointer"
          >
            <Checkbox
              className="mt-0.5"
              checked={granted(consentType)}
              onChange={(e) => onChange(consentType, e.target.checked)}
              disabled={disabled}
            />
            <span>
              {/* An anchor off the app's own chrome, which the
                  no-off-site-links rule permits: that rule governs
                  staff-authored copy written to one family, and this is a
                  consent sentence naming the partner it is about. A parent
                  being asked to share their address with Lynx Educate has to
                  be able to go and look at who that is. */}
              {t.rich("lynxEducate", {
                link: (chunks) => (
                  <a
                    href={LYNX_EDUCATE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-foreground"
                  >
                    {chunks}
                  </a>
                ),
              })}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
