"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
// The RAW pathname, deliberately, and for both halves of what this does. The
// wrapped `usePathname` answers with the internal *template*, which would make
// every product page the same string — so a visitor walking from one product to
// the next would report one page view between them. This is also the value the
// normalizer is written for: it takes what is in the address bar
// (`/fi/kauppa/abc`) and answers with the template.
import { usePathname } from "next/navigation";
import { isMarketingPage } from "@/lib/marketing-pages";
import { isValidPixelId } from "@/lib/marketing-events";
import { reportMetaPageView } from "@/lib/meta-pixel";
import { normalizeExternalPath } from "@/lib/navigation/locale-path";
import { useAuth } from "@/providers/auth-provider";
import { useConsent } from "./consent-provider";

const subscribeToNothing = () => () => {};

/**
 * Whether this render is in a browser. A server render, and the hydration
 * render that has to agree with it, read false; every client render after that
 * reads true. An external store rather than a flag set in an effect, so the
 * switch is React's own post-hydration re-render.
 */
function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

/**
 * The Meta Pixel: the one script on the site that exists to serve somebody
 * other than the visitor, and therefore the one with the most gates in front of
 * it. All six must hold, and all six are decided in the browser:
 *
 *   1. the visitor has said yes to marketing;
 *   2. this is a client render, not the server one or the hydration one;
 *   3. the visitor is not — and cannot be — a signed-in gamer;
 *   4. the advertiser id is configured, and is an id rather than a placeholder;
 *   5. the page is on the marketing-page allowlist (`@/lib/marketing-pages`);
 *   6. at the moment of reporting, the tab is still on that page and its query
 *      string carries only campaign and shop-filter keys — never the
 *      `redirect` the proxy adds when it bounces a signed-out parent from a
 *      child's page to the login page.
 *
 * **The fifth and sixth gates are what make the other four sufficient.** Meta's
 * library sends the page URL and the document's referrer with every event, and
 * several of our URLs are secrets: a password-reset link, a PIN reset, an email
 * verification, a seat offer, and the pages that name a child by id. Mounting
 * the pixel on every page would hand all of them over. So the pixel is loaded
 * on first need *on a marketing page*, and once loaded it stays loaded and inert
 * — it reports nothing on its own, because the loader turns Meta's automatic
 * page-view-on-navigation off.
 *
 * An unset `NEXT_PUBLIC_META_PIXEL_ID` means the pixel is simply off, which is
 * what every non-production environment gets. The id is a public, non-secret
 * value: it identifies the advertiser account, and the library ships it to the
 * browser anyway.
 *
 * Deliberately no `<noscript><img>` fallback. Meta's is a bare tracking pixel in
 * markup, and a browser only loads `<noscript>` content with scripting off — so
 * its entire audience is visitors who cannot run the consent banner, and every
 * event it sent would be one nobody agreed to. Gating it on the consent cookie
 * server-side would not rescue it: it would count, in practice, no one.
 */
export function MetaPixel() {
  const { consent } = useConsent();
  const { user, profile, isLoading } = useAuth();
  const isClient = useIsClient();
  const pathname = usePathname();
  /** The last pathname this effect has seen, reported or not. */
  const lastPathname = useRef<string | null>(null);

  const rawPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const pixelId = isValidPixelId(rawPixelId) ? rawPixelId : null;

  // **A signed-in visitor whose profile we could not read counts as a possible
  // gamer.** The rule is by who is signed in rather than by URL, so a child's
  // browsing never reaches an ad platform on any surface, whatever a parent once
  // answered on a shared device — and the doubt is resolved in the safe
  // direction: anonymous is fine, a known non-gamer is fine, and anything else
  // (still loading, or signed in with no profile) is not.
  const isNotAGamer =
    !isLoading &&
    (user === null || (profile !== null && profile.role !== "gamer"));

  const allowed = isClient && consent?.marketing === true && isNotAGamer;

  useEffect(() => {
    if (!allowed || pixelId === null) return;

    // One page view per marketing page *reached*, which is not the same as per
    // render and not the same as per distinct page: a re-render reports nothing,
    // and coming back to a page after another one is a second view of it. The
    // ref is updated for every pathname the effect accepts, marketing or not,
    // which is what makes the return trip a new view rather than a repeat.
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;

    const { template } = normalizeExternalPath(pathname);
    if (!isMarketingPage(template)) return;

    // Loads the library on first need, then reports — but only once the
    // library has arrived and only if the tab is still on this page with a
    // query that may travel (the loader re-reads the address bar at that
    // moment). Fire and forget: it cannot throw, and nothing here waits on it.
    void reportMetaPageView(pixelId, pathname);
  }, [allowed, pathname, pixelId]);

  return null;
}
