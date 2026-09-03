"use client";

import { ConsentBannerView } from "./consent-banner-view";
import { useConsent } from "./consent-provider";

/**
 * The consent strip, wired to the stored answer.
 *
 * Shown while the question is open — no cookie of the current version — and
 * again whenever the footer's Cookie settings link reopens it. It is `fixed`,
 * so it appears over the page rather than pushing it: an element the reader
 * could be pointing at when the banner arrives is in the same place
 * afterwards.
 */
export function ConsentBanner() {
  const { consent, isOpen, choose } = useConsent();

  if (consent !== null && !isOpen) return null;

  return <ConsentBannerView onChoose={choose} placement="fixed" />;
}
