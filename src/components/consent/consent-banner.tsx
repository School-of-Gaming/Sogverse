"use client";

import { ConsentBannerView } from "./consent-banner-view";
import { useConsent } from "./consent-provider";

/**
 * The consent strip, wired to the stored answer.
 *
 * Shown while the question is open — no cookie of the current version — and
 * again whenever the footer's Privacy choices link reopens it. It is `fixed`,
 * so it appears over the page rather than pushing it: an element the reader
 * could be pointing at when the banner arrives is in the same place
 * afterwards.
 *
 * It asks on every surface, the gamer one included. The pixels keep their own
 * exclusion list (a child's surface never loads an ad-platform script, whatever
 * was answered), so a gate on the question itself would withhold no script and
 * protect nothing — it was tried and removed as complexity without coverage.
 */
export function ConsentBanner() {
  const { consent, isOpen, choose } = useConsent();

  if (consent !== null && !isOpen) return null;

  return <ConsentBannerView onChoose={choose} placement="fixed" />;
}
