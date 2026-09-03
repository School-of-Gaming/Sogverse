"use client";

import { usePathname } from "next/navigation";
import { matchesPathPrefix } from "@/lib/consent";
import { ROUTES } from "@/lib/constants";
import { ConsentBannerView } from "./consent-banner-view";
import { useConsent } from "./consent-provider";

/**
 * Where the question is not asked at all.
 *
 * **A child must not answer it.** A gamer signs in through their parent's
 * account, and consent to analytics and advertising is the parent's to give —
 * putting the strip in front of the child either collects an answer from
 * someone who cannot give one or, worse, teaches them to dismiss it. Nothing
 * optional runs on a gamer surface anyway (the pixels exclude it outright, and
 * an unanswered question runs nothing), so hiding the strip withholds no
 * choice: it withholds a question the reader is not the right person for.
 *
 * **Kept separate from the pixels' own exclusion list**, which is longer and
 * answers a different question. A staff surface or a login form is a fine place
 * to *ask* — a gedu and an admin are adults with their own answer to give, and
 * so is a parent halfway through signing in — it is only a poor place to load
 * an ad-platform script. One list would have to be the intersection of two
 * different rules, and would go wrong the first time either of them changed.
 */
const BANNER_FREE_PREFIXES = [ROUTES.gamer.dashboard];

/**
 * The consent strip, wired to the stored answer.
 *
 * Shown while the question is open — no cookie of the current version — and
 * again whenever the footer's Privacy choices link reopens it. It is `fixed`,
 * so it appears over the page rather than pushing it: an element the reader
 * could be pointing at when the banner arrives is in the same place
 * afterwards.
 */
export function ConsentBanner() {
  const { consent, isOpen, choose } = useConsent();
  const pathname = usePathname();

  if (matchesPathPrefix(pathname, BANNER_FREE_PREFIXES)) return null;
  if (consent !== null && !isOpen) return null;

  return <ConsentBannerView onChoose={choose} placement="fixed" />;
}
