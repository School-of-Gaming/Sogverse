/**
 * The Meta Pixel, loaded from app code rather than from an inline snippet.
 *
 * Client-safe and React-free: one function that installs Meta's library and one
 * that reports an event through it, so the component above it is only the gates
 * and the effect.
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
 * The queueing stub is still Meta's own, byte for byte in behaviour: an `fbq()`
 * call made before the library has finished downloading is pushed onto
 * `fbq.queue` and replayed by the library on arrival. That is what lets a
 * caller load and report in the same tick.
 */

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

/** Meta's queueing stub, exactly as its base code builds it. */
function installStub(): Fbq {
  const existing = window.fbq;
  if (existing) return existing;

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
 * Install Meta's library and initialise the pixel. Idempotent: a second call is
 * a no-op, so a caller may load on every page it is allowed to report from
 * without tracking whether it has loaded already.
 *
 * **No `PageView` here.** Loading and reporting are separate on purpose —
 * Meta's snippet fuses them, which is how a page that merely *loads* the pixel
 * ends up reported. The caller reports, once it knows what page it is on.
 */
export function loadMetaPixel(pixelId: string): void {
  if (typeof window === "undefined") return;
  if (window.fbq) return;

  const fbq = installStub();

  const script = document.createElement("script");
  script.async = true;
  script.src = FBEVENTS_SRC;
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
}

/**
 * Report one event, if the pixel is loaded. A call before the library has
 * arrived is queued by the stub; a call with no pixel at all is a no-op, so no
 * call site needs its own gate.
 */
export function trackMetaEvent(eventName: string): void {
  if (typeof window === "undefined") return;
  window.fbq?.("track", eventName);
}
