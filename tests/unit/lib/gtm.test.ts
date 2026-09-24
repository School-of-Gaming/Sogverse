// @vitest-environment jsdom
//
// jsdom because the loader's whole job is to install a global and append a
// script element to a real document, and what it appends is the thing under
// test. Under node there is no `window` to install on, and the loader's own
// guard would make every case a silent no-op that still passed.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsentState } from "@/lib/consent";
import { commandValues, isArgumentsObject } from "../../helpers/data-layer";

/**
 * ============================================================================
 * The Tag Manager loader: the container, and the fence it is loaded inside.
 * ============================================================================
 *
 * The official snippet builds the queue, announces the container and downloads
 * it in one breath, on whatever page the document happens to be. This app
 * cannot have that — the page has to be checked against the marketing-page
 * allowlist first — so the two halves are split, and what is pinned here is
 * everything the container is told *before* it can act.
 *
 * Three of those things have teeth, and the order they sit in the queue is the
 * assertion for all three: the container reads the queue it finds on arrival
 * from the front, so an entry ahead of its own start signal is state it has
 * before it can fire anything, and an entry behind it is news that arrives too
 * late to constrain it.
 *
 *   - **The blocklist**, which forbids the container from bringing in code or a
 *     third party through the Tag Manager UI, and forbids every one of Google's
 *     automatic trigger listeners — so nothing the visitor does after the page
 *     the container loaded on can fire a tag. It is the only control this
 *     repository keeps over a surface that is edited in a web form, with no
 *     review and no deploy.
 *   - **The denied-by-default consent signals**, which are what a tag firing
 *     before it has seen any consent state would otherwise assume the other way
 *     round.
 *   - **The granted signals**, derived from the visitor's own answer.
 *
 * The consent commands are pushed as `arguments` objects rather than as arrays,
 * and that is asserted outright, because the difference is invisible on the
 * page and total on the wire: the container reads an arguments object as a
 * command and an array as three numbered keys to merge into its data model. A
 * container that never sees the command behaves exactly like one that ignores
 * consent.
 *
 * The report half has one property that matters more than the rest: a page view
 * is never left in the queue for the container to read against a later URL.
 */

type GtmModule = typeof import("@/lib/gtm");

const CONTAINER_ID = "GTM-5WS8TXL4";

const GRANTED_BOTH: ConsentState = {
  analytics: true,
  marketing: true,
  decidedAt: "2026-09-01T08:00:00.000Z",
};

const ANALYTICS_ONLY: ConsentState = { ...GRANTED_BOTH, marketing: false };

/**
 * A fresh copy of the module per case.
 *
 * The loader remembers, for the lifetime of a document, whether the container
 * has been asked for — so a case asserting what happens *before* the first load
 * would otherwise be asserting about whatever the previous case left behind,
 * and would pass or fail on the order the file happens to run in.
 */
let gtm: GtmModule;

/** Everything pushed into the queue, in order. */
function queue(): unknown[] {
  return window.dataLayer ?? [];
}

function insertedScripts(): HTMLScriptElement[] {
  return Array.from(
    document.querySelectorAll<HTMLScriptElement>(
      'script[src*="googletagmanager.com"]',
    ),
  );
}

/** jsdom fetches nothing, so the container's arrival is announced by hand. */
function containerArrives() {
  insertedScripts()[0]?.dispatchEvent(new Event("load"));
}

function containerFails() {
  insertedScripts()[0]?.dispatchEvent(new Event("error"));
}

/** Put the tab on a URL, the way a navigation would. */
function tabIsOn(url: string) {
  window.history.pushState({}, "", url);
}

beforeEach(async () => {
  vi.resetModules();
  delete window.dataLayer;
  document.head.innerHTML = "";
  tabIsOn("/shop");
  gtm = await import("@/lib/gtm");
});

describe("loadGtm", () => {
  it("inserts the container exactly once, asynchronously, by its id", () => {
    void gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);

    const scripts = insertedScripts();
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe(
      `https://www.googletagmanager.com/gtm.js?id=${CONTAINER_ID}`,
    );
    expect(scripts[0].async).toBe(true);
  });

  // The line the whole design rests on: nothing that can bring in code or a
  // third party, and not one of the nine listeners that would fire a tag on
  // whatever page the visitor reached after this one.
  it("fences the container before anything else", () => {
    void gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);

    expect(queue()[0]).toEqual({
      "gtm.blocklist": [
        "customScripts",
        "html",
        "sandboxedScripts",
        "nonGoogleScripts",
        "nonGooglePixels",
        "nonGoogleIframes",
        "customPixels",
        "cl",
        "lcl",
        "fsl",
        "tl",
        "hl",
        "sdl",
        "evl",
        "jel",
        "ytl",
      ],
    });
  });

  // Every one of Google's built-in auto-event listeners, named as a set rather
  // than read off the line above: a listener quietly dropped from the array is
  // a document-wide trigger back on a platform children sign into, and the
  // array's own assertion would go on passing as long as it matched itself.
  it("blocks every built-in auto-event listener, not just the history one", () => {
    void gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);

    expect(queue()[0]).toEqual({
      "gtm.blocklist": expect.arrayContaining([
        "cl",
        "lcl",
        "fsl",
        "tl",
        "hl",
        "sdl",
        "evl",
        "jel",
        "ytl",
      ]),
    });
  });

  // `customScripts` is the Custom HTML tag and the Custom JavaScript variable;
  // a custom template and a non-Google tag are neither, and under
  // `'strict-dynamic'` anything the container inserts is trusted by the policy.
  it("blocks every class that could bring in code or a third party", () => {
    void gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);

    expect(queue()[0]).toEqual({
      "gtm.blocklist": expect.arrayContaining([
        "customScripts",
        "html",
        "sandboxedScripts",
        "nonGoogleScripts",
        "nonGooglePixels",
        "nonGoogleIframes",
        "customPixels",
      ]),
    });
  });

  it("denies every signal by default, then grants what the visitor gave", () => {
    void gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);

    expect(commandValues(queue()[1])).toEqual([
      "consent",
      "default",
      {
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        analytics_storage: "denied",
      },
    ]);
    expect(commandValues(queue()[2])).toEqual([
      "consent",
      "update",
      {
        ad_storage: "granted",
        ad_user_data: "granted",
        ad_personalization: "granted",
        analytics_storage: "granted",
      },
    ]);
  });

  // The loader states the answer it was handed rather than the answer its
  // caller's gate implies. The gate is marketing, so this state does not reach
  // it through the app — which is exactly why the value that travels is derived
  // from the cookie and not written as a constant that agrees with the gate.
  it("derives every signal from the answer it is handed", () => {
    void gtm.loadGtm(CONTAINER_ID, ANALYTICS_ONLY);

    expect(commandValues(queue()[2])).toEqual([
      "consent",
      "update",
      {
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        analytics_storage: "granted",
      },
    ]);
  });

  // Invisible on the page, total on the wire: an array of the same three values
  // is merged into the data model as `{0: …, 1: …, 2: …}` and the command is
  // never seen.
  it("pushes each consent command as an arguments object, never an array", () => {
    void gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);

    for (const entry of [queue()[1], queue()[2]]) {
      expect(isArgumentsObject(entry)).toBe(true);
      expect(Array.isArray(entry)).toBe(false);
    }
  });

  // The container reads the queue it finds from the front, so everything that
  // constrains it has to be ahead of the signal that starts it.
  it("puts the fence and the consent state ahead of the container's start", () => {
    void gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);

    const start = queue().findIndex(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        "gtm.start" in entry,
    );
    expect(start).toBe(3);
  });

  it("never reports a page view of its own", () => {
    void gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);

    expect(queue().some((entry) => hasEventName(entry, "page_view"))).toBe(
      false,
    );
  });

  it("is a no-op when the container is already installed", () => {
    const first = gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);
    const before = queue().length;

    const second = gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);

    expect(second).toBe(first);
    expect(insertedScripts()).toHaveLength(1);
    expect(queue()).toHaveLength(before);
  });

  it("resolves true once the container has loaded, false if it never does", async () => {
    const loaded = gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);
    containerArrives();
    await expect(loaded).resolves.toBe(true);

    vi.resetModules();
    delete window.dataLayer;
    document.head.innerHTML = "";
    const fresh = await import("@/lib/gtm");
    const blocked = fresh.loadGtm(CONTAINER_ID, GRANTED_BOTH);
    containerFails();
    await expect(blocked).resolves.toBe(false);
  });
});

/** Whether a queue entry is one of our own events, by name. */
function hasEventName(entry: unknown, name: string): boolean {
  return (
    typeof entry === "object" &&
    entry !== null &&
    "event" in entry &&
    entry.event === name
  );
}

/**
 * An event may sit in the queue waiting for the container, and a page view may
 * not. The difference is not the payload — it is that an event states the page
 * it happened on, while a page view's permission to be sent expires the moment
 * the visitor moves.
 */
describe("pushGtmEvent", () => {
  it("pushes nothing until the container has been asked for", () => {
    gtm.pushGtmEvent({ event: "sign_up", page_path: "/register" });

    expect(window.dataLayer).toBeUndefined();
  });

  it("pushes while the container is still downloading", () => {
    void gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);

    gtm.pushGtmEvent({ event: "sign_up", page_path: "/register" });

    expect(queue().at(-1)).toEqual({ event: "sign_up", page_path: "/register" });
  });

  // An ad blocker refused the container, so the queue is a global array nothing
  // will ever read. Going on appending to it would be a growing record of the
  // visit sitting where any later script can find it — and the promise of
  // "nothing is pushed unless a container is coming" is what makes queueing an
  // event safe in the first place.
  it("stops pushing once the container has failed to load", async () => {
    const loading = gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);
    containerFails();
    await loading;
    const before = queue().length;

    gtm.pushGtmEvent({ event: "sign_up", page_path: "/register" });

    expect(queue()).toHaveLength(before);
  });
});

describe("reportGtmPageView", () => {
  it("reports only after the container has arrived, never into its queue", async () => {
    const report = gtm.reportGtmPageView(CONTAINER_ID, "/shop", GRANTED_BOTH);

    // The container is still downloading: nothing may sit in the queue waiting
    // to be read against whatever URL the tab shows by then.
    expect(queue().some((entry) => hasEventName(entry, "page_view"))).toBe(
      false,
    );

    containerArrives();
    await report;

    expect(queue().at(-1)).toEqual({
      event: "page_view",
      page_path: "/shop",
    });
  });

  // What travels is the internal path, not the address bar and not the
  // template: the locale prefix is gone and the slug is untranslated, while the
  // product's own id stays — the same field every other event states, so a view
  // and the enrolment after it name one page.
  it("reports the internal path of a translated product page", async () => {
    tabIsOn("/fi/kauppa/abc-123");
    const report = gtm.reportGtmPageView(
      CONTAINER_ID,
      "/fi/kauppa/abc-123",
      GRANTED_BOTH,
    );

    containerArrives();
    await report;

    expect(queue().at(-1)).toEqual({
      event: "page_view",
      page_path: "/shop/abc-123",
    });
  });

  // The whole reason for waiting: a parent who clicked from the shop into a
  // child's page while the container was downloading.
  it("reports nothing when the tab has moved to another page meanwhile", async () => {
    const report = gtm.reportGtmPageView(CONTAINER_ID, "/shop", GRANTED_BOTH);
    tabIsOn("/parent/gamers/abc-123");

    containerArrives();
    await report;

    expect(queue().some((entry) => hasEventName(entry, "page_view"))).toBe(
      false,
    );
  });

  // The proxy's bounce for a signed-out parent: the pathname is a marketing
  // page, the query names a child.
  it("loads nothing, let alone reports, when the query carries anything but campaign keys", async () => {
    tabIsOn("/login?redirect=/en/parent/gamers/abc-123");

    await gtm.reportGtmPageView(CONTAINER_ID, "/login", GRANTED_BOTH);

    // Not even the container: a page we will not report from is a page
    // somebody else's tags have no business running on.
    expect(insertedScripts()).toHaveLength(0);
    expect(window.dataLayer).toBeUndefined();
  });

  // The query turning private between the request and the container's arrival
  // — the tab was bounced while the download was in flight.
  it("reports nothing when the query turned private meanwhile", async () => {
    const report = gtm.reportGtmPageView(CONTAINER_ID, "/login", GRANTED_BOTH);
    tabIsOn("/login?redirect=/en/parent/gamers/abc-123");

    containerArrives();
    await report;

    expect(queue().some((entry) => hasEventName(entry, "page_view"))).toBe(
      false,
    );
  });

  it("reports a page whose query is an ad link's", async () => {
    tabIsOn("/roblox?utm_source=lynx&gclid=abc123");
    const report = gtm.reportGtmPageView(CONTAINER_ID, "/roblox", GRANTED_BOTH);

    containerArrives();
    await report;

    expect(queue().at(-1)).toEqual({
      event: "page_view",
      page_path: "/roblox",
    });
  });

  it("compares the pathname through the URL parser, encoded or not", async () => {
    tabIsOn("/fi/kauppa/caf%C3%A9-123");
    const report = gtm.reportGtmPageView(
      CONTAINER_ID,
      "/fi/kauppa/café-123",
      GRANTED_BOTH,
    );

    containerArrives();
    await report;

    expect(queue().at(-1)).toEqual({
      event: "page_view",
      page_path: "/shop/café-123",
    });
  });

  // A URL matching no route of ours has no template to name, and an unknown
  // URL is the last thing that should be reported anywhere.
  it("loads nothing for a URL that matches no route", async () => {
    tabIsOn("/not-a-page-we-have");

    await gtm.reportGtmPageView(
      CONTAINER_ID,
      "/not-a-page-we-have",
      GRANTED_BOTH,
    );

    expect(insertedScripts()).toHaveLength(0);
    expect(window.dataLayer).toBeUndefined();
  });

  it("reports nothing when the container never loads", async () => {
    const report = gtm.reportGtmPageView(CONTAINER_ID, "/shop", GRANTED_BOTH);

    containerFails();
    await report;

    expect(queue().some((entry) => hasEventName(entry, "page_view"))).toBe(
      false,
    );
  });
});

/** Every `set` command in the queue, as it was pushed. */
function setEntries(): unknown[] {
  return queue().filter((entry) => commandValues(entry)[0] === "set");
}

/** The single pinned page, or `undefined` if nothing was pinned. */
function pinnedPage(): unknown {
  const entries = setEntries();
  expect(entries).toHaveLength(1);
  return commandValues(entries[0])[1];
}

/**
 * ============================================================================
 * The page gtag names in the events it generates for itself.
 * ============================================================================
 *
 * Our own events state their `page_path`, so no tag of ours reads the address
 * bar — but gtag emits events that reach no tag at all, `user_engagement` above
 * all, and fills those from the live document. A container outlives the
 * marketing page that authorised it, because a client navigation builds no new
 * document, so an unpinned container reports whatever private URL the tab ended
 * on. `set` writes the page into the data model every later event is read
 * against, including those, and it stands until it is written again.
 *
 * Stickiness is what makes the negatives below the load-bearing half: a pin on
 * a page we refused to report would be the same leak by another route, and it
 * would outlast the navigation that caused it.
 */
describe("the page pinned for gtag's own events", () => {
  it("pins the page alongside a reported page view", async () => {
    const report = gtm.reportGtmPageView(CONTAINER_ID, "/shop", GRANTED_BOTH);

    containerArrives();
    await report;

    expect(pinnedPage()).toEqual({
      page_location: `${window.location.origin}/shop`,
      page_title: "Sogverse",
    });
  });

  // The same distinction the consent commands are held to, for the same
  // reason: an array of the same values is merged into the data model as
  // numbered keys and the command is never seen, which on the wire is
  // indistinguishable from a container that was never told the page.
  it("pins as an arguments object, never an array", async () => {
    const report = gtm.reportGtmPageView(CONTAINER_ID, "/shop", GRANTED_BOTH);

    containerArrives();
    await report;

    const [entry] = setEntries();
    expect(isArgumentsObject(entry)).toBe(true);
    expect(Array.isArray(entry)).toBe(false);
  });

  // The pinned location names the same page the view does: origin plus the
  // internal path, not the translated, locale-prefixed one in the address bar.
  it("pins the internal path of a locale-prefixed page, not the address bar's", async () => {
    tabIsOn("/sv/butik");
    const report = gtm.reportGtmPageView(
      CONTAINER_ID,
      "/sv/butik",
      GRANTED_BOTH,
    );

    containerArrives();
    await report;

    expect(pinnedPage()).toEqual({
      page_location: `${window.location.origin}/shop`,
      page_title: "Sogverse",
    });
  });

  // A dynamic route keeps the record's own id, exactly as the page view does:
  // a product page is a public URL naming a product, and collapsing it to its
  // template would name every product at once.
  it("keeps a dynamic route's own id in the pinned location", async () => {
    tabIsOn("/fi/kauppa/abc-123");
    const report = gtm.reportGtmPageView(
      CONTAINER_ID,
      "/fi/kauppa/abc-123",
      GRANTED_BOTH,
    );

    containerArrives();
    await report;

    expect(pinnedPage()).toEqual({
      page_location: `${window.location.origin}/shop/abc-123`,
      page_title: "Sogverse",
    });
  });

  // A constant, not `document.title`: the report runs from an effect just after
  // the route changed, and the App Router updates the title on its own
  // schedule — so the title read here can still be the previous page's, and the
  // previous page may have been a private one naming a child.
  it("pins a constant title, whatever the document currently says", async () => {
    document.title = "My SOG | School of Gaming";
    const report = gtm.reportGtmPageView(CONTAINER_ID, "/shop", GRANTED_BOTH);

    containerArrives();
    await report;

    expect(pinnedPage()).toEqual({
      page_location: `${window.location.origin}/shop`,
      page_title: "Sogverse",
    });
  });

  // The proxy's bounce for a signed-out parent: a marketing pathname whose
  // query names a child. Refused for the report, and so refused for the pin.
  it("pins nothing when the query may not travel", async () => {
    tabIsOn("/login?redirect=/en/parent/gamers/abc-123");

    await gtm.reportGtmPageView(CONTAINER_ID, "/login", GRANTED_BOTH);

    expect(window.dataLayer).toBeUndefined();
  });

  // The case the whole defect is about, arriving one step earlier: the visitor
  // left the shop for a child's page while the container was still
  // downloading. A pin here would name the shop while the tab is elsewhere —
  // which is the intended behaviour once a page has been *reported*, and a
  // fabrication for one that never was.
  it("pins nothing when the tab moved on during the load", async () => {
    const report = gtm.reportGtmPageView(CONTAINER_ID, "/shop", GRANTED_BOTH);
    tabIsOn("/parent/gamers/abc-123");

    containerArrives();
    await report;

    expect(setEntries()).toHaveLength(0);
  });

  it("pins nothing for a URL that matches no route", async () => {
    tabIsOn("/not-a-page-we-have");

    await gtm.reportGtmPageView(
      CONTAINER_ID,
      "/not-a-page-we-have",
      GRANTED_BOTH,
    );

    expect(window.dataLayer).toBeUndefined();
  });

  // Nothing may be queued for a container that will never arrive — an ad
  // blocker refused it, so the queue is a global array nothing will read.
  it("pins nothing when the container never loads", async () => {
    const report = gtm.reportGtmPageView(CONTAINER_ID, "/shop", GRANTED_BOTH);

    containerFails();
    await report;

    expect(setEntries()).toHaveLength(0);
  });
});
