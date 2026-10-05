"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
// The RAW pathname, deliberately, and for both halves of what this does. The
// wrapped `usePathname` answers with the internal *template*, which would make
// every product page the same string — so a visitor walking from one product to
// the next would report one page view between them. This is also the value the
// normalizer is written for: it takes what is in the address bar
// (`/fi/kauppa/abc`) and answers with the template.
import { usePathname } from "next/navigation";
import { isMarketingPage } from "@/lib/marketing-pages";
import {
  isAdvertisedProduct,
  isValidPixelId,
  metaProductDetails,
  PIXEL_EVENTS,
} from "@/lib/marketing-events";
import {
  reportMetaEvent,
  reportMetaEventNow,
  type BrowserPixelEvent,
} from "@/lib/meta-pixel";
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

/** One object for the life of the module, so the effect never sees a new one. */
const PAGE_VIEW: BrowserPixelEvent = { event: PIXEL_EVENTS.pageView };

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
  useMetaPixelReport(PAGE_VIEW);
  return null;
}

/**
 * A product view, reported from the product's own page — the one marketing
 * page that knows which product it is showing, which the pixel above, mounted
 * once for the whole site, does not.
 *
 * **Behind every gate the page view is, because it is the same machinery.**
 * Consent, the client render, the gamer rule, the configured id, the allowlist
 * and the address-bar re-read are not restated here: this reports through the
 * same hook, once per page reached, so a gate added to the page view is a gate
 * on this too.
 *
 * Only for a product we advertise, decided by the product row exactly as the
 * servers decide their enrolment reports — a view of a municipality club is a
 * family looking at their school's club, and no campaign is served by it.
 * Nothing is reported until the product has been read, and the view is counted
 * once the read lands rather than at the navigation, so a slow read delays the
 * view rather than losing it.
 */
export function MetaProductView({
  product,
}: {
  /** `null` while the product has not been read yet. */
  product: ReportedProduct | null;
}) {
  // Memoised on the row so a re-render hands the hook the same report; the
  // hook's once-per-page guard would hold either way. An unread product and one
  // we do not advertise both hand it `null`, which never counts the page as
  // reached — so a read landing later still reports, and nothing else does.
  const report = useMemo(
    () => productReport(PIXEL_EVENTS.productView, product),
    [product],
  );
  useMetaPixelReport(report);
  return null;
}

/** A product as the two product events read it. */
type ReportedProduct = Parameters<typeof metaProductDetails>[0] &
  Parameters<typeof isAdvertisedProduct>[0];

/**
 * A product event for `product`, or `null` — "nothing to report" — while it is
 * unread and for a product we do not advertise, decided by the product row
 * exactly as the servers decide their enrolment reports.
 */
function productReport(
  event: typeof PIXEL_EVENTS.productView | typeof PIXEL_EVENTS.checkout,
  product: ReportedProduct | null,
): BrowserPixelEvent | null {
  return product !== null && isAdvertisedProduct(product)
    ? { event, product: metaProductDetails(product) }
    : null;
}

/**
 * The checkout start: a parent on a product's page clicking into the sign-up
 * flow — creating an account there, or pressing the button that enrols. Returns
 * the function to call from that click; calling it is the whole of the report.
 *
 * **Behind every gate the views are**, from the same gate hook, plus the
 * allowlist and the address-bar re-read at the moment of sending, and only for
 * a product we advertise. **Once per product page reached**: a second click, or
 * a failed attempt tried again, sends nothing more; leaving and coming back is
 * a new page reached.
 *
 * **Sent inside the click, or not at all.** The click usually navigates — to
 * the account form, or to Stripe once the enrolment answers — and an event
 * that waited for anything would find the tab gone and be refused by the
 * address-bar check. So this never loads the library and never waits for it:
 * on a page that has already reported its view the library is here and the
 * event goes out synchronously, before the navigation has begun; before that,
 * the click is simply not reported (`reportMetaEventNow`). Nothing about it
 * can delay or block the parent's own navigation.
 *
 * Call it from the component that stays mounted for the page's whole life,
 * like the product view, so its once-per-page guard is not reset by a remount.
 */
export function useMetaCheckoutStart(
  product: ReportedProduct | null,
): () => void {
  const pixelId = useMetaPixelGate();
  const pathname = usePathname();
  /** The page this hook has already reported a checkout start from. */
  const reportedOn = useRef<string | null>(null);

  // A different page is a new page reached, even when this hook outlives the
  // move — so the guard is cleared on every pathname, including a return to
  // the page it was last set for.
  useEffect(() => {
    reportedOn.current = null;
  }, [pathname]);

  const report = useMemo(
    () => productReport(PIXEL_EVENTS.checkout, product),
    [product],
  );

  return useCallback(() => {
    if (pixelId === null || report === null) return;
    if (reportedOn.current === pathname) return;
    const { template } = normalizeExternalPath(pathname);
    if (!isMarketingPage(template)) return;
    if (reportMetaEventNow(pathname, report)) reportedOn.current = pathname;
  }, [pixelId, report, pathname]);
}

/**
 * The first four gates, which hold for the visitor rather than for a page: the
 * pixel id when the visitor has said yes to marketing, this is a client render,
 * the visitor is not a gamer and the id is configured — `null` otherwise. The
 * last two, the allowlist and the address bar, belong to each report.
 */
function useMetaPixelGate(): string | null {
  const { consent } = useConsent();
  const { user, profile, isLoading } = useAuth();
  const isClient = useIsClient();

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
  return allowed ? pixelId : null;
}

/**
 * Report `report` once per marketing page reached, behind all six gates.
 * `null` is "nothing to report on this page yet": it neither reports nor counts
 * the page as reached, so the report goes out once it stops being `null`.
 */
function useMetaPixelReport(report: BrowserPixelEvent | null): void {
  const pixelId = useMetaPixelGate();
  const pathname = usePathname();
  /** The last pathname this effect has seen, reported or not. */
  const lastPathname = useRef<string | null>(null);

  useEffect(() => {
    if (pixelId === null || report === null) return;

    // One report per marketing page *reached*, which is not the same as per
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
    void reportMetaEvent(pixelId, pathname, report);
  }, [pathname, pixelId, report]);
}
