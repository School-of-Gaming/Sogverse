"use client";

import { useTranslations } from "next-intl";
import { useConsentOptional } from "./consent-provider";

/**
 * The footer's way back to the consent question — a button wearing the legal
 * row's link styling, because it opens a strip on this page rather than
 * navigating anywhere.
 *
 * **It says "Privacy choices", the same words the strip's own heading uses.**
 * A reader who answered "Your privacy, your choice" and later wants to change
 * it should be looking for the words they already read, not for a second
 * vocabulary about cookies — the cookies are the mechanism, the choice is the
 * thing they made.
 *
 * It is the mechanism the banner's own copy and the privacy policy both promise
 * ("you can change your mind any time from the footer"), so those sentences are
 * only true while this renders.
 *
 * **Renders nothing where no `ConsentProvider` sits above it.** The footer is a
 * server component on every route group, and a client child of it that threw
 * would take down whatever page it was at the bottom of — so the link waits for
 * the provider rather than insisting on it.
 */
export function PrivacyChoicesLink() {
  const t = useTranslations("footer");
  const consent = useConsentOptional();

  if (!consent) return null;

  return (
    <button
      type="button"
      onClick={consent.open}
      className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
    >
      {t("privacyChoices")}
    </button>
  );
}
