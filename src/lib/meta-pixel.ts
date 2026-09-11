/**
 * The Meta Pixel, loaded from app code rather than from an inline snippet.
 *
 * Client-safe and React-free: one function that installs Meta's library and one
 * that reports a page view through it, so the component above it is only the
 * gates and the effect.
 *
 * **Why not the official inline snippet.** Meta's base code is a `<script>` in
 * the document that loads the library and reports a PageView the moment it
 * parses — which is a PageView of whatever page the document happens to be,
 * before anything in the app has had a chance to decide that this page may be
 * reported at all. Moving the same work into a function the app calls is what
 * makes "only on a marketing page" expressible: nothing runs until a caller
 * that has checked its gates calls it. It also costs the app a nonce it no
 * longer needs — under the production CSP (`'nonce-…' 'strict-dynamic'`) a
 * script element created by already-trusted app code is trusted, so the
 * insertion below needs nothing named in `script-src`.
 *
 * **Why a report waits for the library rather than using Meta's queue.** The
 * stub queues any call made before the library arrives, and the library replays
 * the queue on arrival — against the URL the tab shows *then*, not the one it
 * showed when the call was made. A visitor can client-navigate from a shop page
 * into a child's page inside the few hundred milliseconds the download takes,
 * and a queued PageView would then carry the child's URL. So nothing is ever
 * queued here: a report waits for the script's `load`, re-checks that the tab
 * is still on the page that authorised it, and only then calls the library,
 * which reads the URL synchronously.
 */

import { isReportableQuery } from "@/lib/marketing-pages";
import { PIXEL_EVENTS } from "@/lib/marketing-events";

const FBEVENTS_SRC = "https://connect.facebook.net/en_US/fbevents.js";

/**
 * Meta's global. It is callable and carries the fields the library reads back
 * off it — `queue` and `callMethod` are the queue handshake, `version` and
 * `loaded` are what the library checks to recognise its own stub, and the three
 * behaviour flags below are ours to set.
 */
interface Fbq {
  (...args: unknown[]): void;
  /** Installed by the library once it has loaded; absent until then. */
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: unknown;
  loaded: boolean;
  version: string;
  /**
   * **Off, and this is the gate the whole design rests on.** Left at its
   * default, the library patches `history.pushState` and reports a PageView on
   * every client-side navigation — including the ones into `/parent/gamers/<a
   * child's id>` and out of a password-reset link — with the new URL and the
   * old one as the referrer. With it off, a PageView happens only where this
   * app asks for one.
   */
  disablePushState?: boolean;
  /**
   * **On, deliberately.** The library suppresses a second PageView in the same
   * document, which is the right default for a page that loads the pixel once
   * and never navigates. Ours is a single document a visitor walks several
   * marketing pages through, and each of those pages is a page view — so the
   * suppression would report the first one only.
   */
  allowDuplicatePageViews?: boolean;
}

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

/**
 * Whether the library has arrived, for the document this module was loaded
 * into. `null` until the first load is asked for; a stub left over from an
 * earlier document (tests reset the global) starts the load over.
 */
let libraryLoaded: Promise<boolean> | null = null;

/** Meta's queueing stub, exactly as its base code builds it. */
function installStub(): Fbq {
  // A function with fields on it, built by assignment rather than by asserting
  // a bare function into the richer type: every field the library reads back is
  // then something the compiler has actually seen set.
  const queue: unknown[][] = [];
  const call = (...args: unknown[]) => {
    if (stub.callMethod) {
      stub.callMethod(...args);
      return;
    }
    queue.push(args);
  };
  const stub: Fbq = Object.assign(call, {
    queue,
    // Replaced immediately below; the field exists here so the object is a
    // complete `Fbq` from the moment it is built.
    push: undefined as unknown,
    loaded: true,
    version: "2.0",
  });
  // `push = itself` is Meta's own line and is not decoration: the library (and
  // Meta's own documentation for queueing before load) treats `fbq.push` as the
  // way to enqueue a call, so the two names have to be the same function.
  stub.push = stub;

  window.fbq = stub;
  // The legacy alias the library still looks for. Set only when absent, which
  // is what Meta's snippet does.
  window._fbq ??= stub;

  return stub;
}

/**
 * Install Meta's library and initialise the pixel. Idempotent: a second call
 * returns the first call's promise, so a caller may load on every page it is
 * allowed to report from without tracking whether it has loaded already.
 * Resolves `true` once the library has run, `false` if the browser refused or
 * failed to fetch it (an ad blocker, most often) — in which case there is
 * nothing to report through and never will be in this document.
 *
 * **No `PageView` here.** Loading and reporting are separate on purpose —
 * Meta's snippet fuses them, which is how a page that merely *loads* the pixel
 * ends up reported. The caller reports, once it knows what page it is on.
 */
export function loadMetaPixel(pixelId: string): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.fbq && libraryLoaded) return libraryLoaded;

  const fbq = installStub();

  const script = document.createElement("script");
  script.async = true;
  script.src = FBEVENTS_SRC;
  libraryLoaded = new Promise<boolean>((resolve) => {
    script.addEventListener("load", () => resolve(true));
    script.addEventListener("error", () => resolve(false));
  });
  document.head.appendChild(script);

  fbq.disablePushState = true;
  fbq.allowDuplicatePageViews = true;
  // **`autoConfig` off, and before `init` because that is when the library
  // reads it.** Left on, the pixel takes its behaviour from the Meta Ads
  // dashboard, where Automatic Advanced Matching and automatic events can be
  // switched on by anyone with access to the ad account: the library then
  // scrapes form fields and button clicks on the page and hashes what it finds
  // — email addresses, phone numbers, names — into every event. Our privacy
  // copy says what Meta receives, and a setting in somebody else's dashboard
  // must not be able to make that sentence false.
  fbq("set", "autoConfig", false, pixelId);
  fbq("init", pixelId);

  return libraryLoaded;
}

/**
 * Report a page view of `pathname`, the page the caller has already checked
 * against the marketing-page allowlist.
 *
 * The report goes out only once the library has arrived, and only if the tab
 * is still on that pathname with a query string that may travel — re-read from
 * the address bar at that moment, because that is the URL the library attaches.
 * A visitor who moved on in the meantime gets no report for the page they
 * left, and none for the page they reached: the caller reports that one, or
 * refuses it, on its own terms.
 */
export async function reportMetaPageView(
  pixelId: string,
  pathname: string,
): Promise<void> {
  // Checked before loading as well as before sending: a page whose query may
  // not travel gets no library at all, not merely no report. The proxy's
  // bounce to the login page is the case — a marketing page by pathname,
  // carrying a private path in its query.
  if (!isReportableQuery(window.location.search)) return;
  const ready = await loadMetaPixel(pixelId);
  if (!ready) return;
  // Both sides resolved through the URL parser, so a slug with a non-ASCII
  // character compares the same whether the router hands it over encoded or
  // not.
  const authorised = new URL(pathname, window.location.origin).pathname;
  if (window.location.pathname !== authorised) return;
  if (!isReportableQuery(window.location.search)) return;
  window.fbq?.("track", PIXEL_EVENTS.pageView);
}
