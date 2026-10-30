/**
 * The Reddit Pixel, loaded from app code rather than from an inline snippet —
 * built the way the Meta Pixel is (`@/lib/meta-pixel`), for the same reasons.
 *
 * Client-safe and React-free: one function that installs Reddit's library and
 * two that report an event through it — one that waits for the library, for a
 * page reached, and one that does not, for a click.
 *
 * **Why not the official base code.** Reddit's snippet loads the library and
 * reports a `PageVisit` in the same breath, which is a report of whatever page
 * the document happens to be, before anything here has decided that this page
 * may be reported. So loading and reporting are split, and the library is
 * inserted by app code, which the production CSP's `'strict-dynamic'` trusts
 * with no vendor host named in `script-src`.
 *
 * **Why a report waits for the library rather than using Reddit's queue.** The
 * stub queues any call made before the library arrives, and the library
 * replays the queue on arrival — against the URL the tab shows *then*. A
 * visitor can client-navigate from a shop page into a child's page inside the
 * download, and a queued `PageVisit` would then carry the child's URL. So
 * nothing that reports is ever queued here: a report waits for the script's
 * `load`, re-checks the address bar, and only then calls the library.
 *
 * **What the library does by itself, and what stops it.** It fetches a
 * configuration from Reddit's Events Manager on load, which can add event
 * rules fired on URL changes and clicks, match form fields against email and
 * phone shapes, and scrape the page title and description. The base code has
 * no switch for that the way Meta's `autoConfig` is one, so the CSP leaves
 * the configuration host out of
 * `connect-src`, so the fetch fails and the library runs on the calls this
 * module makes and nothing else (`src/proxy.ts`). That holds only because the
 * library is requested without the pixel id: asked for by id, Reddit serves a
 * copy with the configuration written into the script itself, so there is no
 * fetch for the CSP to refuse — seen on staging with the real pixel.
 */

import { isReportableQuery, addressBarStillShows } from "@/lib/marketing-pages";
import {
  REDDIT_PIXEL_EVENTS,
  type RedditProductDetails,
} from "@/lib/marketing-events";

const PIXEL_JS_SRC = "https://www.redditstatic.com/ads/pixel.js";

/**
 * Reddit's global. It is callable, queues into `callQueue` until the library
 * has installed `sendEvent`, and then forwards every call to it.
 *
 * How the library arrives, read from Reddit's pixel.js rather than observed:
 * at the end of its own top-level run it assigns `rdt.sendEvent` on the
 * existing global — it fills our stub in, it does not replace `window.rdt` —
 * and then drains `callQueue` synchronously. So by the script's `load`,
 * `sendEvent` is set, and a `sendEvent` that is set is the one sign that a
 * call reaches the library now rather than the queue.
 */
interface Rdt {
  (...args: unknown[]): void;
  /** Installed by the library once it has loaded; absent until then. */
  sendEvent?: (...args: unknown[]) => void;
  callQueue: unknown[][];
}

declare global {
  interface Window {
    rdt?: Rdt;
  }
}

/**
 * Whether the library has arrived, for the document this module was loaded
 * into. `null` until the first load is asked for; a stub left over from an
 * earlier document (tests reset the global) starts the load over.
 */
let libraryLoaded: Promise<boolean> | null = null;

/** Reddit's queueing stub, exactly as its base code builds it. */
function installStub(): Rdt {
  const callQueue: unknown[][] = [];
  const call = (...args: unknown[]) => {
    if (stub.sendEvent) {
      stub.sendEvent(...args);
      return;
    }
    callQueue.push(args);
  };
  const stub: Rdt = Object.assign(call, { callQueue });
  window.rdt = stub;
  return stub;
}

/**
 * Install Reddit's library and initialise the pixel. Idempotent: a second call
 * returns the first call's promise. Resolves `true` once the library has run,
 * `false` if the browser refused or failed to fetch it — in which case there
 * is nothing to report through in this document.
 *
 * **No `PageVisit` here, and no match keys.** The caller reports, once it
 * knows what page it is on; and `init` is handed the id alone — no email, no
 * external id — because the browser's events identify nobody beyond the
 * pixel's own cookies. `init`'s opt-out and first-party-cookie options are
 * left at their defaults: the pixel runs only under marketing consent, and its
 * cookies are what a withdrawal sweeps.
 */
export function loadRedditPixel(pixelId: string): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.rdt && libraryLoaded) return libraryLoaded;

  const rdt = installStub();

  const script = document.createElement("script");
  script.async = true;
  // No `?pixel_id=`, unlike Reddit's base code: that copy carries the Events
  // Manager configuration inline, past the CSP (see the module comment).
  script.src = PIXEL_JS_SRC;
  libraryLoaded = new Promise<boolean>((resolve) => {
    script.addEventListener("load", () => resolve(true));
    script.addEventListener("error", () => resolve(false));
  });
  document.head.appendChild(script);

  // Queued, deliberately and harmlessly: `init` reports nothing and carries
  // no URL, so its replay on arrival is not the hazard a queued report is.
  rdt("init", pixelId);

  return libraryLoaded;
}

/**
 * The events the browser may send to Reddit, and what each carries — the same
 * three moments the Meta Pixel reports, under Reddit's names.
 */
export type RedditBrowserEvent =
  | { event: typeof REDDIT_PIXEL_EVENTS.pageView }
  | {
      event:
        | typeof REDDIT_PIXEL_EVENTS.productView
        | typeof REDDIT_PIXEL_EVENTS.checkout;
      product: RedditProductDetails;
    };

/**
 * Report `report` as having happened on `pathname`, the page the caller has
 * already checked against the marketing-page allowlist. Every event the
 * browser sends to Reddit comes through here or through the click's report
 * below, page view or not, because the library attaches the address bar's URL
 * to whatever it tracks.
 *
 * The report goes out only once the library has arrived, and only if the tab
 * is still on that pathname with a query string that may travel.
 */
export async function reportRedditEvent(
  pixelId: string,
  pathname: string,
  report: RedditBrowserEvent,
): Promise<void> {
  // Checked before loading as well as before sending: a page whose query may
  // not travel gets no library at all — the proxy's bounce to the login page
  // is the case.
  if (!isReportableQuery(window.location.search)) return;
  const ready = await loadRedditPixel(pixelId);
  if (!ready) return;
  trackIfStillOn(pathname, report);
}

/**
 * Report `report` right now, inside the caller's own task, or not at all — for
 * the checkout-start click, which usually navigates. Only if the library has
 * already arrived: before that the click is dropped rather than queued, and
 * this never starts a load. Answers whether the event went out, so a caller
 * counting "once per page" counts only a real send.
 */
export function reportRedditEventNow(
  pathname: string,
  report: RedditBrowserEvent,
): boolean {
  if (typeof window === "undefined") return false;
  return trackIfStillOn(pathname, report);
}

/**
 * The checks made at the moment of sending, and the send — straight to the
 * library's `sendEvent`, never through the stub. Without it the library has
 * not arrived (or a `load` came without it), and the event is dropped rather
 * than queued for a replay against a later URL.
 */
function trackIfStillOn(pathname: string, report: RedditBrowserEvent): boolean {
  const sendEvent = window.rdt?.sendEvent;
  if (typeof sendEvent !== "function") return false;
  if (!addressBarStillShows(pathname)) return false;
  if ("product" in report) sendEvent("track", report.event, report.product);
  else sendEvent("track", report.event);
  return true;
}
