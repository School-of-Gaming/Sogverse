"use client";

import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { LYNX_EDUCATE_URL } from "@/lib/constants/marketing-consents";
import type { MarketingConsentType } from "@/types";

/**
 * The order the two consents are rendered in, written out rather than read off
 * the enum or off the stored rows.
 *
 * Postgres orders an enum by *declaration* order and a select returns whatever
 * order it likes, so neither is a promise about what a parent should read first.
 * This is: our own mailing list, then the partner's. Exported because the card
 * that saves them walks the same list.
 */
export const MARKETING_CONSENT_ORDER = [
  "school_of_gaming",
  "lynx_educate",
] as const satisfies readonly MarketingConsentType[];

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
  granted,
  onChange,
  disabled,
}: {
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

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium leading-none">{t("title")}</legend>
      <div className="flex flex-col gap-2">
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
                        href={LYNX_EDUCATE_URL}
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
      </div>
    </fieldset>
  );
}
