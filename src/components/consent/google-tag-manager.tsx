"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
// The RAW pathname, deliberately, and for both halves of what this does. The
// wrapped `usePathname` answers with the internal *template*, which would make
// every product page the same string — so a visitor walking from one product to
// the next would report one page view between them. This is also the value the
// normalizer is written for: it takes what is in the address bar
// (`/fi/kauppa/abc`) and answers with the template.
import { usePathname } from "next/navigation";
import { GTM_EVENTS, isValidGtmContainerId } from "@/lib/gtm-events";
import {
  pushGtmProductEventNow,
  reportGtmPageView,
  reportGtmProductEvent,
  type GtmGate,
} from "@/lib/gtm";
import { gtmEcommerce, isAdvertisedProduct } from "@/lib/marketing-events";
import { isMarketingPage } from "@/lib/marketing-pages";
import { normalizeExternalPath } from "@/lib/navigation/locale-path";
import { useAuth } from "@/providers/auth-provider";
import { useConsent } from "./consent-provider";
import {
  useMayReachAdvertising,
  usePixelClickReport,
  usePixelReportPerPage,
} from "./pixel-gates";

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
 * cannot see — Meta's and Reddit's browser pixels among them — and therefore
 * behind six gates. All six are decided in the browser:
 *
 *   1. the visitor has said yes to marketing;
 *   2. this is a client render, not the server one or the hydration one;
 *   3. the visitor is not — and cannot be — a signed-in gamer;
 *   4. the container id is configured, and is an id rather than a placeholder;
 *   5. the page is on the marketing-page allowlist (`@/lib/marketing-pages`);
 *   6. at the moment of reporting, the tab is still on that page and its query
 *      string carries only campaign keys, click ids, shop-filter keys, or a
 *      `redirect` whose value is itself a reportable marketing page — never
 *      the `redirect` the proxy adds when it bounces a signed-out parent from
 *      a child's page to the login page.
 *
 * **The first gate is marketing.** A container mints
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
 * keeps it quiet afterwards is the loader's blocklist — every one of Google's
 * automatic triggers is forbidden, so nothing the container could have been
 * configured to fire fires on a client navigation into a private page — and the
 * Meta and Reddit globals it installs, which keep those vendors' libraries from
 * reporting a navigation by themselves (`@/lib/ad-pixel-stubs`).
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

/** A product as the two product events read it. */
type ReportedProduct = Parameters<typeof gtmEcommerce>[0] &
  Parameters<typeof isAdvertisedProduct>[0];

/**
 * A product page's view as `view_item`: once per product page reached, once the
 * product has been read, behind every gate and check the page view goes
 * through — the same hooks (`./pixel-gates`), so a gate added there is a gate
 * here.
 *
 * **Every product, with `advertised` beside it**: this is analytics' event as
 * well as the advertising tags', and which of them reads which products is
 * decided per tag (`@/lib/gtm-events`). The product view loads the container itself if the
 * page view has not yet: this component sits below the one that reports the
 * page view, so its effect runs first, and a view that merely waited for the
 * container would be dropped on every first page.
 */
export function GtmProductView({
  product,
}: {
  /** `null` while the product has not been read yet. */
  product: ReportedProduct | null;
}) {
  const report = useMemo(
    () => productEvent(GTM_EVENTS.productView, product),
    [product],
  );
  usePixelReportPerPage(useGtmGate(), report, reportGtmProductEvent);
  return null;
}

/**
 * A product page's click into the sign-up flow as `add_to_cart`: the function
 * to call from that click. Once per product page reached, pushed inside the
 * click or not at all, behind the same gates and the same address-bar check as
 * the view — and never loading the container, so nothing about it can hold up
 * the parent's navigation.
 *
 * Call it from the component that stays mounted for the page's whole life, so
 * its once-per-page guard is not reset by a remount.
 */
export function useGtmCheckoutStart(
  product: ReportedProduct | null,
): () => void {
  const report = useMemo(
    () => productEvent(GTM_EVENTS.checkoutStart, product),
    [product],
  );
  return usePixelClickReport(useGtmGate(), report, pushGtmProductEventNow);
}

/**
 * A product event for `product` — priced, because a view and a click state the
 * price the page shows anyone — or `null` while it is unread.
 */
function productEvent<
  Event extends
    | typeof GTM_EVENTS.productView
    | typeof GTM_EVENTS.checkoutStart,
>(event: Event, product: ReportedProduct | null) {
  return product === null
    ? null
    : {
        event,
        ecommerce: gtmEcommerce(product, { priced: true }),
        advertised: isAdvertisedProduct(product),
      };
}

/**
 * The first four gates — marketing granted, a client render, not a gamer, a
 * configured container id — as what loading the container needs, or `null`.
 * Memoised, because the report hook re-runs its effect on a new gate.
 */
function useGtmGate(): GtmGate | null {
  const allowed = useMayReachAdvertising();
  const { consent } = useConsent();
  const rawContainerId = process.env.NEXT_PUBLIC_GTM_CONTAINER_ID;
  const containerId = isValidGtmContainerId(rawContainerId)
    ? rawContainerId
    : null;
  return useMemo(
    () =>
      allowed && consent !== null && containerId !== null
        ? { containerId, consent }
        : null,
    [allowed, consent, containerId],
  );
}
