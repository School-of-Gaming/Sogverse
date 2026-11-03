/**
 * Meta's and Reddit's browser globals, installed by the Tag Manager loader
 * before the container arrives, so the container's Meta and Reddit tags drive
 * *these* rather than ones of their own.
 *
 * Client-safe and React-free. Nothing here reports anything: a stub is inert
 * until a tag calls it, and only the container's tags do.
 *
 * **Why the app still owns the global when the container owns the tag.** Both
 * vendors' gallery templates look for an existing global before building their
 * own — Meta's reads `fbq` with `copyFromWindow` and uses it if present, and
 * Reddit's does the same with `rdt` (read from the templates' source:
 * github.com/meta/GoogleTagManager-WebTemplate-For-FacebookPixel and
 * github.com/reddit/reddit-gtm-template). So whatever the app installs first is
 * what every tag in the container calls, and that is the one place left where
 * code under review can hold the guarantees the vendors' defaults would break:
 *
 *   - **Meta never reports a navigation by itself.** Its library patches
 *     `history.pushState` and reports a PageView on every client navigation
 *     unless the global it finds says `disablePushState` — in a client-routed
 *     app that is a report of a password-reset link or a child's page by id.
 *     The template sets the flag only when a box in its form is ticked; here it
 *     is set before the library exists and cannot be unset.
 *   - **Meta's dashboard cannot turn on form scraping.** Left alone, the pixel
 *     takes `autoConfig` from the Meta Ads dashboard, where Automatic Advanced
 *     Matching can be switched on by anyone with the ad account: the library
 *     then lifts email addresses, phone numbers and names out of the page. The
 *     stub turns it off for every pixel the container initialises, before the
 *     `init` the library reads it at — whatever the tag's own box says.
 *   - **Reddit's library is the generic one.** Reddit's template asks for
 *     `pixel.js?pixel_id=…`, a copy carrying the Events Manager configuration
 *     inline, where the CSP cannot refuse it; the container's policy refuses
 *     that request (`@/lib/gtm-policy`), and the stub fetches the generic
 *     library the first time a tag calls it, so the configuration is a fetch
 *     the CSP still refuses (`src/proxy.ts`).
 *   - **No report is replayed against a later page.** Each vendor's own stub
 *     queues a call made before its library has arrived, and the library
 *     replays the queue against the URL the tab shows *then*. A visitor can
 *     client-navigate from a shop page into a child's page inside that
 *     download. These stubs hold a call with the page it was made on, and on
 *     the library's arrival release a report only if the tab is still there —
 *     every other call (`init`, `set`, `consent`) is released regardless, in
 *     order. The library's arrival is the moment it installs its dispatcher on
 *     the global (`callMethod` for Meta, `sendEvent` for Reddit), which both
 *     do by plain assignment, read from their sources.
 *
 * **A library that arrives without the stub noticing fails silently in
 * production.** Everything above rests on one observation about two files we
 * do not control: that each library announces itself by assigning its
 * dispatcher to the global it found. If a vendor renames that dispatcher, or
 * starts replacing the global rather than filling it in, the library loads, the
 * stub never sees it, and every held call — every report — stays held: nothing
 * is sent, nothing errors, and the only sign is a platform's event count going
 * flat. Outside production builds, each stub therefore warns in the console
 * when its vendor's script has finished loading and no dispatcher has arrived
 * by the next tick — on the element the stub inserts for Reddit, and on any
 * `fbevents.js` element for Meta, whose template inserts it. A production build
 * folds the check away, so there the risk stays silent; the first place it
 * shows is a developer's console, and the next is the platforms' own event
 * screens.
 *
 * **What the stubs cannot hold.** Meta's library locks itself while it fetches
 * a pixel's configuration and queues calls made meanwhile, replaying them when
 * it unlocks — the same window existed when the app loaded the pixel itself.
 * And anything a tag sends is what its fields in the Tag Manager form say: the
 * stubs keep the vendors' automatic behaviour off, they do not vet a tag's
 * parameters.
 */

const REDDIT_LIBRARY = "https://www.redditstatic.com/ads/pixel.js";

/** Meta's calls that report something; every other method configures. */
const META_REPORTS = new Set([
  "track",
  "trackCustom",
  "trackSingle",
  "trackSingleCustom",
]);

/** Reddit's one call that reports something. */
const REDDIT_REPORTS = new Set(["track"]);

type Dispatch = (...args: unknown[]) => void;

/**
 * Meta's global, as its base code builds it: callable, with the queue
 * handshake (`queue`, `push`, `callMethod`), the fields its library checks to
 * recognise a stub (`loaded`, `version`), and the two behaviour flags.
 */
interface Fbq {
  (...args: unknown[]): void;
  callMethod?: Dispatch;
  queue: unknown[];
  push: unknown;
  loaded: boolean;
  version: string;
  /** Always `true`; an assignment is ignored. */
  disablePushState: boolean;
  /**
   * Always `true`, so each marketing page a visitor walks through in this one
   * document is its own page view rather than a duplicate of the first.
   */
  allowDuplicatePageViews: boolean;
}

/**
 * Reddit's global: callable, queueing into `callQueue` until its library
 * installs `sendEvent`. The library fills the existing global in rather than
 * replacing it.
 */
interface Rdt {
  (...args: unknown[]): void;
  sendEvent?: Dispatch;
  callQueue: unknown[];
}

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
    rdt?: Rdt;
  }
}

/** A call made before the library arrived, and the page it was made on. */
interface HeldCall {
  args: unknown[];
  page: string;
}

/** The page as a report would name it: the path and the query, not the hash. */
function currentPage(): string {
  return window.location.pathname + window.location.search;
}

/**
 * The hold-and-release both stubs share: `call` dispatches straight to the
 * library once it has arrived and holds the call otherwise, and `arrive`
 * records the library's dispatcher and releases what was held — in a
 * microtask, so the library has finished installing itself first, and with
 * every report whose page the tab has since left dropped.
 */
function holdUntilArrival(
  self: () => unknown,
  isReport: (args: unknown[]) => boolean,
) {
  const held: HeldCall[] = [];
  let dispatch: Dispatch | undefined;

  const call = (args: unknown[]) => {
    if (dispatch) {
      dispatch.apply(self(), args);
      return;
    }
    held.push({ args, page: currentPage() });
  };

  const arrive = (value: unknown) => {
    if (typeof value !== "function") return;
    // A function the library hands over, called the way the vendor's own stub
    // calls it — with the global as `this`.
    dispatch = (...args: unknown[]) => {
      Reflect.apply(value, self(), args);
    };
    queueMicrotask(() => {
      const page = currentPage();
      for (const { args, page: madeOn } of held.splice(0)) {
        if (isReport(args) && madeOn !== page) continue;
        call(args);
      }
    });
  };

  return { call, arrive, dispatcher: () => dispatch };
}

/** Meta's library at the path its template injects it from, any locale. */
const META_LIBRARY = /^https:\/\/connect\.facebook\.net\/[a-z]{2}_[A-Z]{2}\/fbevents\.js$/;

/**
 * Outside production builds: once a vendor's script has loaded, warn on the
 * next tick if its dispatcher still has not arrived — the silent failure the
 * module docblock describes. The library runs before its element's `load`
 * fires, so by then a library that announces itself has done so.
 */
function warnIfUnnoticed(vendor: string, arrived: () => boolean): void {
  setTimeout(() => {
    if (arrived()) return;
    console.warn(
      `[ad-pixel-stubs] ${vendor}'s library loaded but never installed its dispatcher on our global, so every call the stub holds stays held and nothing is reported. The vendor has likely changed how its library announces itself.`,
    );
  }, 0);
}

/** A property every assignment to is ignored, reading `true` for good. */
function pinnedTrue(target: object, key: string): void {
  Object.defineProperty(target, key, {
    configurable: false,
    enumerable: true,
    get: () => true,
    set: () => {},
  });
}

function installMetaStub(): void {
  if (window.fbq) return;

  /** Pixels already told `autoConfig` is off, so it is said once per pixel. */
  const autoConfigOff = new Set<string>();
  const gate = holdUntilArrival(
    () => stub,
    (args) => typeof args[0] === "string" && META_REPORTS.has(args[0]),
  );

  const fbq = (...args: unknown[]) => {
    const [method, pixelId] = args;
    // Before `init`, because that is when the library reads it.
    if (
      method === "init" &&
      typeof pixelId === "string" &&
      !autoConfigOff.has(pixelId)
    ) {
      autoConfigOff.add(pixelId);
      gate.call(["set", "autoConfig", false, pixelId]);
    }
    gate.call(args);
  };
  const stub: Fbq = Object.assign(fbq, {
    queue: [],
    // Replaced below: Meta's own line is `push = itself`, and the library
    // treats the two names as one function.
    push: undefined as unknown,
    loaded: true,
    version: "2.0",
    disablePushState: true,
    allowDuplicatePageViews: true,
  });
  stub.push = stub;
  pinnedTrue(stub, "disablePushState");
  pinnedTrue(stub, "allowDuplicatePageViews");
  Object.defineProperty(stub, "callMethod", {
    configurable: true,
    enumerable: true,
    get: gate.dispatcher,
    set: gate.arrive,
  });

  window.fbq = stub;
  // The legacy alias the library still looks for, set only when absent as
  // Meta's own snippet does.
  window._fbq ??= stub;

  if (process.env.NODE_ENV !== "production") {
    // Meta's template inserts the library, so its element is caught as its
    // `load` passes the document: the event does not bubble, but capture sees
    // it. Checked only while this stub is still the page's global, so a stub
    // some later install replaced says nothing.
    const onLoad = (event: Event) => {
      const { target } = event;
      if (!(target instanceof HTMLScriptElement)) return;
      if (!META_LIBRARY.test(target.src)) return;
      document.removeEventListener("load", onLoad, true);
      warnIfUnnoticed(
        "Meta",
        () => window.fbq !== stub || gate.dispatcher() !== undefined,
      );
    };
    document.addEventListener("load", onLoad, true);
  }
}

function installRedditStub(): void {
  if (window.rdt) return;

  let libraryRequested = false;
  const gate = holdUntilArrival(
    () => stub,
    (args) => typeof args[0] === "string" && REDDIT_REPORTS.has(args[0]),
  );

  const rdt = (...args: unknown[]) => {
    gate.call(args);
    if (libraryRequested) return;
    libraryRequested = true;
    // Inserted by app code, which the production CSP's `'strict-dynamic'`
    // trusts. Nothing waits on it: a library that never arrives leaves every
    // call held, which reports nothing.
    const script = document.createElement("script");
    script.async = true;
    script.src = REDDIT_LIBRARY;
    if (process.env.NODE_ENV !== "production") {
      script.addEventListener("load", () => {
        warnIfUnnoticed("Reddit", () => gate.dispatcher() !== undefined);
      });
    }
    document.head.appendChild(script);
  };
  const stub: Rdt = Object.assign(rdt, { callQueue: [] });
  Object.defineProperty(stub, "sendEvent", {
    configurable: true,
    enumerable: true,
    get: gate.dispatcher,
    set: gate.arrive,
  });

  window.rdt = stub;
}

/**
 * Install both vendors' globals, if nothing has yet. Called by the loader
 * before the container's script is inserted, so no tag can run ahead of them.
 */
export function installAdPixelStubs(): void {
  if (typeof window === "undefined") return;
  installMetaStub();
  installRedditStub();
}
