"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
// The RAW pathname, deliberately, and for both halves of what this does. The
// wrapped `usePathname` answers with the internal *template*, which would make
// every product page the same string — so a visitor walking from one product to
// the next would report one page view between them. This is also the value the
// normalizer is written for: it takes what is in the address bar
// (`/fi/kauppa/abc`) and answers with the template.
import { usePathname } from "next/navigation";
import { isValidGtmContainerId } from "@/lib/gtm-events";
import { reportGtmPageView } from "@/lib/gtm";
import { isMarketingPage } from "@/lib/marketing-pages";
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
 * Google Tag Manager: a container of tags configured somewhere this repository
 * cannot see, and therefore behind the same six gates the pixel is. All six are
 * decided in the browser:
 *
 *   1. the visitor has said yes to marketing;
 *   2. this is a client render, not the server one or the hydration one;
 *   3. the visitor is not — and cannot be — a signed-in gamer;
 *   4. the container id is configured, and is an id rather than a placeholder;
 *   5. the page is on the marketing-page allowlist (`@/lib/marketing-pages`);
 *   6. at the moment of reporting, the tab is still on that page and its query
 *      string carries only campaign and shop-filter keys — never the
 *      `redirect` the proxy adds when it bounces a signed-out parent from a
 *      child's page to the login page.
 *
 * **The first gate is marketing, the pixel's gate exactly.** A container mints
 * a persistent client id and carries advertising tags, so a visitor who took
 * analytics gets none of it: analytics on this site is Vercel's, cookieless,
 * and that is what the strip and the privacy policy describe it as. Google is a
 * marketing recipient and is reached only by a visitor who agreed to one. A
 * refusal — and an unanswered question — means the container never loads at
 * all: no script, no request to Google.
 *
 * **The fifth and sixth gates are what make the other four sufficient.** A tag
 * reports the page it fires on, and several of our URLs are secrets: a
 * password-reset link, a PIN reset, an email verification, a seat offer, and
 * the pages that name a child by id. The container is loaded on first need *on
 * a marketing page* and then stays loaded for the rest of the document, so what
 * keeps it quiet afterwards is the loader's blocklist: every one of Google's
 * automatic triggers is forbidden, so nothing the container could have been
 * configured to fire fires on a client navigation into a private page.
 *
 * An unset `NEXT_PUBLIC_GTM_CONTAINER_ID` means the container is simply off,
 * which is what every environment but production and preview gets. The id is a
 * public, non-secret value: the browser downloads the container by it.
 *
 * Deliberately no `<noscript><iframe>` fallback. Google's is a bare tracking
 * frame in markup, and a browser only loads `<noscript>` content with scripting
 * off — so its entire audience is visitors who cannot run the consent banner,
 * and every hit it sent would be one nobody agreed to. It would also be a frame
 * with none of the gates above in front of it.
 */
export function GoogleTagManager() {
  const { consent } = useConsent();
  const { user, profile, isLoading } = useAuth();
  const isClient = useIsClient();
  const pathname = usePathname();
  /** The last pathname this effect has seen, reported or not. */
  const lastPathname = useRef<string | null>(null);

  const rawContainerId = process.env.NEXT_PUBLIC_GTM_CONTAINER_ID;
  const containerId = isValidGtmContainerId(rawContainerId)
    ? rawContainerId
    : null;

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
    // `allowed` carries the answer's own non-nullness with it, so the loader
    // can be handed the stored state below without a second test: it needs the
    // answer itself, not the permission, because the Consent Mode signals it
    // pushes ahead of the container are derived from it. Those signals are
    // still the load-bearing part for EEA and UK traffic, where a Google tag
    // that has not been told what it may store is not permitted to guess.
    if (!allowed || containerId === null) return;

    // One page view per marketing page *reached*, which is not the same as per
    // render and not the same as per distinct page: a re-render reports nothing,
    // and coming back to a page after another one is a second view of it. The
    // ref is updated for every pathname the effect accepts, marketing or not,
    // which is what makes the return trip a new view rather than a repeat.
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;

    const { template } = normalizeExternalPath(pathname);
    if (!isMarketingPage(template)) return;

    // Loads the container on first need, then reports — but only once the
    // container has arrived and only if the tab is still on this page with a
    // query that may travel (the loader re-reads the address bar at that
    // moment). Fire and forget: it cannot throw, and nothing here waits on it.
    void reportGtmPageView(containerId, pathname, consent);
  }, [allowed, consent, containerId, pathname]);

  return null;
}
