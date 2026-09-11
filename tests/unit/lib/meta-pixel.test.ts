// @vitest-environment jsdom
//
// jsdom because the loader's whole job is to install a global and append a
// script element to a real document, and what it appends is the thing under
// test. Under node there is no `window` to install on, and the loader's own
// guard would make every case a silent no-op that still passed.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadMetaPixel, reportMetaPageView } from "@/lib/meta-pixel";

/**
 * ============================================================================
 * The Meta Pixel loader: Meta's base code, minus the part that reports.
 * ============================================================================
 *
 * The official snippet loads the library and reports a PageView in the same
 * breath, which is exactly what this app cannot have: the page has to be checked
 * against the marketing-page allowlist first, and a PageView fused into loading
 * is one nobody chose. So the two are split, and the load half is what is pinned
 * here — that it inserts the library once, and above all that it sets the three
 * flags that decide what the library does on its own afterwards.
 *
 * `autoConfig` is the one with teeth. Left on, the pixel takes its behaviour
 * from whatever is switched on in the Meta Ads dashboard — including Automatic
 * Advanced Matching, which scrapes form fields and hashes email addresses and
 * phone numbers into every event. Our privacy copy says what Meta receives, and
 * a setting in someone else's dashboard must not be able to make that sentence
 * false. It only takes effect *before* `init`, so the order is the assertion.
 *
 * The report half has one property that matters more than the rest: nothing is
 * ever left in Meta's queue for the library to replay against a later URL. A
 * report waits for the script to load and re-reads the address bar first.
 */

const PIXEL_ID = "1234567890";

/** Every call made through the stub, in order. */
function calls(): unknown[][] {
  return window.fbq?.queue ?? [];
}

function insertedScripts(): HTMLScriptElement[] {
  return Array.from(
    document.querySelectorAll<HTMLScriptElement>(
      'script[src*="connect.facebook.net"]',
    ),
  );
}

/** jsdom fetches nothing, so the library's arrival is announced by hand. */
function libraryArrives() {
  insertedScripts()[0]?.dispatchEvent(new Event("load"));
}

function libraryFails() {
  insertedScripts()[0]?.dispatchEvent(new Event("error"));
}

/** Put the tab on a URL, the way a navigation would. */
function tabIsOn(url: string) {
  window.history.pushState({}, "", url);
}

beforeEach(() => {
  // A fresh document and a fresh global: the loader's first guard is
  // `window.fbq`, so a stub left behind by the previous case would make the
  // next one assert about nothing.
  delete window.fbq;
  delete window._fbq;
  document.head.innerHTML = "";
  tabIsOn("/shop");
});

afterEach(() => {
  delete window.fbq;
  delete window._fbq;
});

describe("loadMetaPixel", () => {
  it("installs Meta's queueing stub", () => {
    void loadMetaPixel(PIXEL_ID);

    expect(typeof window.fbq).toBe("function");
    // The fields the real library reads back off the stub when it arrives: the
    // queue it replays, the alias it looks for, and the version that tells it
    // this is one of its own.
    expect(window.fbq?.version).toBe("2.0");
    expect(window.fbq?.loaded).toBe(true);
    expect(window.fbq?.push).toBe(window.fbq);
    expect(window._fbq).toBe(window.fbq);
  });

  it("inserts the library exactly once, asynchronously", () => {
    void loadMetaPixel(PIXEL_ID);

    const scripts = insertedScripts();
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe(
      "https://connect.facebook.net/en_US/fbevents.js",
    );
    expect(scripts[0].async).toBe(true);
  });

  it("sets the two behaviour flags the design rests on", () => {
    void loadMetaPixel(PIXEL_ID);

    // No automatic PageView on a client-side navigation — which is what keeps
    // the pixel silent on the private and token-carrying pages a visitor
    // reaches without a new document.
    expect(window.fbq?.disablePushState).toBe(true);
    // And no suppression of the second PageView in one document: a visitor
    // walking several marketing pages is several page views.
    expect(window.fbq?.allowDuplicatePageViews).toBe(true);
  });

  it("turns autoConfig off BEFORE initialising the pixel", () => {
    void loadMetaPixel(PIXEL_ID);

    expect(calls()).toEqual([
      ["set", "autoConfig", false, PIXEL_ID],
      ["init", PIXEL_ID],
    ]);
  });

  it("never reports a page view of its own", () => {
    void loadMetaPixel(PIXEL_ID);

    expect(calls().some(([method]) => method === "track")).toBe(false);
  });

  it("is a no-op when the pixel is already installed", () => {
    const first = loadMetaPixel(PIXEL_ID);
    const stub = window.fbq;

    const second = loadMetaPixel(PIXEL_ID);

    expect(window.fbq).toBe(stub);
    expect(second).toBe(first);
    expect(insertedScripts()).toHaveLength(1);
    expect(calls()).toHaveLength(2);
  });

  it("resolves true once the library has loaded, false if it never does", async () => {
    const loaded = loadMetaPixel(PIXEL_ID);
    libraryArrives();
    await expect(loaded).resolves.toBe(true);

    delete window.fbq;
    document.head.innerHTML = "";
    const blocked = loadMetaPixel(PIXEL_ID);
    libraryFails();
    await expect(blocked).resolves.toBe(false);
  });
});

describe("reportMetaPageView", () => {
  it("reports only after the library has arrived, never through the queue", async () => {
    const report = reportMetaPageView(PIXEL_ID, "/shop");

    // The library is still downloading: nothing may sit in its queue waiting
    // to be replayed against whatever URL the tab shows by then.
    expect(calls().some(([method]) => method === "track")).toBe(false);

    libraryArrives();
    await report;

    expect(calls().at(-1)).toEqual(["track", "PageView"]);
  });

  // The whole reason for waiting: a parent who clicked from the shop into a
  // child's page while the library was downloading.
  it("reports nothing when the tab has moved to another page meanwhile", async () => {
    const report = reportMetaPageView(PIXEL_ID, "/shop");
    tabIsOn("/parent/gamers/abc-123");

    libraryArrives();
    await report;

    expect(calls().some(([method]) => method === "track")).toBe(false);
  });

  // The proxy's bounce for a signed-out parent: the pathname is a marketing
  // page, the query names a child.
  it("loads nothing, let alone reports, when the query carries anything but campaign keys", async () => {
    tabIsOn("/login?redirect=/en/parent/gamers/abc-123");

    await reportMetaPageView(PIXEL_ID, "/login");

    // Not even the library: a page we will not report from is a page Meta's
    // code has no business running on.
    expect(insertedScripts()).toHaveLength(0);
    expect(window.fbq).toBeUndefined();
  });

  // The query turning private between the request and the library's arrival —
  // the tab was bounced while the download was in flight.
  it("reports nothing when the query turned private meanwhile", async () => {
    const report = reportMetaPageView(PIXEL_ID, "/login");
    tabIsOn("/login?redirect=/en/parent/gamers/abc-123");

    libraryArrives();
    await report;

    expect(calls().some(([method]) => method === "track")).toBe(false);
  });

  it("reports a page whose query is an ad link's", async () => {
    tabIsOn("/roblox?utm_source=lynx&fbclid=IwAR0abc");
    const report = reportMetaPageView(PIXEL_ID, "/roblox");

    libraryArrives();
    await report;

    expect(calls().at(-1)).toEqual(["track", "PageView"]);
  });

  it("compares the pathname through the URL parser, encoded or not", async () => {
    tabIsOn("/fr/%C3%A0-propos");
    const report = reportMetaPageView(PIXEL_ID, "/fr/à-propos");

    libraryArrives();
    await report;

    expect(calls().at(-1)).toEqual(["track", "PageView"]);
  });

  it("reports nothing when the library never loads", async () => {
    const report = reportMetaPageView(PIXEL_ID, "/shop");

    libraryFails();
    await report;

    expect(calls().some(([method]) => method === "track")).toBe(false);
  });
});
