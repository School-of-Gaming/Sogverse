"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Constants, type GamerSignIn } from "@/types";

/**
 * The three modes, in the order they are offered.
 *
 * Read off the generated enum rather than retyped, so a fourth mode appears here
 * the day the database gains one instead of being silently unofferable. The
 * declaration order is also the offering order, and `parent` leads it because
 * `parent` is the default: the first row is the answer a parent keeps by doing
 * nothing.
 */
const SIGN_IN_MODES = Constants.public.Enums.gamer_sign_in;

/**
 * The one place the three sign-in modes are offered, and the one place their
 * sentences are written.
 *
 * Two surfaces ask this question — the add-gamer dialog, before the account
 * exists, and the child's own settings card afterwards — and they have to offer
 * the same three answers in the same order with the same explanations, because a
 * parent who read "no email needed" while creating the account and something
 * else while changing it has been told two things about one mechanism. So the
 * copy lives in one namespace and the rows are drawn once.
 *
 * **Stacked rows at every width, never a segmented control.** Each option
 * carries a sentence saying what the product actually does, and three sentences
 * do not fit side by side on a 360px phone in any locale — French sets
 * "Avec son propre e-mail" where English sets "With their own email". A row per
 * option lets both the label and its sentence wrap into the width they have.
 *
 * The sentence under each option is a mechanism, not a reassurance (root
 * `CLAUDE.md`, "Safety copy"): what a parent is told here — that a switch-only
 * child has no password of their own, that a username-mode child needs no
 * mailbox, that an email-mode child sets their own password from a link — is
 * checkable against the account that gets created.
 */
export function GamerSignInRadios({
  value,
  onChange,
  disabled = false,
  labelId,
  hintId,
  /**
   * Distinguishes this group's radios from any other on the page. Two groups
   * sharing a `name` would let one deselect the other, and the settings page
   * renders this beside other forms.
   */
  name = "gamerSignIn",
}: {
  value: GamerSignIn;
  onChange: (signIn: GamerSignIn) => void;
  disabled?: boolean;
  labelId: string;
  hintId?: string | undefined;
  name?: string;
}) {
  const t = useTranslations("gamerSignIn");

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={hintId}
      className="flex flex-col gap-2"
    >
      {SIGN_IN_MODES.map((mode) => {
        const selected = value === mode;
        return (
          <label
            key={mode}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors",
              selected
                ? "border-primary bg-primary/5"
                : "border-input hover:border-foreground/30",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <input
              type="radio"
              name={name}
              value={mode}
              // `mt-0.5` lifts the control onto the label's first line; the
              // sentence underneath makes the row two lines tall, so a centred
              // radio would float against the gap between them.
              className="mt-0.5 h-4 w-4 shrink-0"
              checked={selected}
              disabled={disabled}
              onChange={() => onChange(mode)}
            />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{t(`option.${mode}`)}</span>
              <span className="block text-muted-foreground">
                {t(`optionHint.${mode}`)}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
