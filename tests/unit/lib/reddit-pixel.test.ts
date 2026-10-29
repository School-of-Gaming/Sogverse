// @vitest-environment jsdom
//
// jsdom because the loader's whole job is to install a global and append a
// script element to a real document, and what it appends is the thing under
// test. Under node there is no `window` to install on, and the loader's own
// guard would make every case a silent no-op that still passed.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadRedditPixel,
  reportRedditEvent,
  reportRedditEventNow,
  type RedditBrowserEvent,
} from "@/lib/reddit-pixel";

/**
 * ============================================================================
 * The Reddit Pixel loader: Reddit's base code, minus the part that reports.
 * ============================================================================
 *
 * The official snippet loads the library and reports a PageVisit in the same
 * breath; here the two are split, as they are for Meta, so the page can be
 * checked against the marketing-page allowlist first. The load half is pinned
 * to insert the library once, initialise the pixel with its id and nothing
 * else — no match keys — and report nothing of its own.
 *
 * The report half has the property that matters more than the rest: nothing
 * that reports is ever left in Reddit's queue for the library to replay
 * against a later URL. A report waits for the script to load and re-reads the
 * address bar first.
 */

const PIXEL_ID = "a2_abc123def456";

const PAGE_VISIT: RedditBrowserEvent = { event: "PageVisit" };

const PRODUCT = {
  products: [
    {
      id: "abc-123",
      name: "Roblox Studio Club",
      category: "roblox_studio" as const,
    },
  ] as [{ id: string; name: string; category: "roblox_studio" }],
  itemCount: 1 as const,
  value: 49,
  currency: "EUR",
};

const PRODUCT_VIEW: RedditBrowserEvent = {
  event: "ViewContent",
  product: PRODUCT,
};

/** Every call made through the stub, in order. */
function calls(): unknown[][] {
  return window.rdt?.callQueue ?? [];
}

function tracked(): unknown[][] {
  return calls().filter(([method]) => method === "track");
}

function insertedScripts(): HTMLScriptElement[] {
  return Array.from(
    document.querySelectorAll<HTMLScriptElement>(
      'script[src*="redditstatic.com"]',
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
  // A fresh global: the loader's first guard is `window.rdt`, so a stub left
  // behind by the previous case would make the next one assert about nothing.
  delete window.rdt;
  document.head.innerHTML = "";
  tabIsOn("/shop");
});

afterEach(() => {
  delete window.rdt;
});

describe("loadRedditPixel", () => {
  it("installs Reddit's queueing stub", () => {
    void loadRedditPixel(PIXEL_ID);

    expect(typeof window.rdt).toBe("function");
    expect(Array.isArray(window.rdt?.callQueue)).toBe(true);
  });

  it("inserts the library exactly once, asynchronously, with the pixel id", () => {
    void loadRedditPixel(PIXEL_ID);

    const scripts = insertedScripts();
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe(
      `https://www.redditstatic.com/ads/pixel.js?pixel_id=${PIXEL_ID}`,
    );
    expect(scripts[0].async).toBe(true);
  });

  // The browser identifies nobody beyond the pixel's own cookies: no email, no
  // external id, no options at all on `init`.
  it("initialises the pixel with its id and no match keys", () => {
    void loadRedditPixel(PIXEL_ID);

    expect(calls()).toEqual([["init", PIXEL_ID]]);
  });

  it("never reports a page visit of its own", () => {
    void loadRedditPixel(PIXEL_ID);
    libraryArrives();

    expect(tracked()).toEqual([]);
  });

  it("is a no-op when the pixel is already installed", () => {
    const first = loadRedditPixel(PIXEL_ID);
    const stub = window.rdt;

    const second = loadRedditPixel(PIXEL_ID);

    expect(window.rdt).toBe(stub);
    expect(second).toBe(first);
    expect(insertedScripts()).toHaveLength(1);
    expect(calls()).toHaveLength(1);
  });

  it("resolves true once the library has loaded, false if it never does", async () => {
    const loaded = loadRedditPixel(PIXEL_ID);
    libraryArrives();
    await expect(loaded).resolves.toBe(true);

    delete window.rdt;
    document.head.innerHTML = "";
    const blocked = loadRedditPixel(PIXEL_ID);
    libraryFails();
    await expect(blocked).resolves.toBe(false);
  });

  // The stub's own handshake: once the library has installed `sendEvent`, a
  // call goes straight to it rather than into the queue.
  it("forwards to the library once it has installed itself", () => {
    void loadRedditPixel(PIXEL_ID);
    const sent: unknown[][] = [];
    const rdt = window.rdt;
    if (rdt === undefined) throw new Error("expected the stub");
    rdt.sendEvent = (...args: unknown[]) => {
      sent.push(args);
    };

    rdt("track", "PageVisit");

    expect(sent).toEqual([["track", "PageVisit"]]);
    expect(tracked()).toEqual([]);
  });
});

describe("reportRedditEvent", () => {
  it("reports only after the library has arrived, never through the queue", async () => {
    const report = reportRedditEvent(PIXEL_ID, "/shop", PAGE_VISIT);

    expect(tracked()).toEqual([]);

    libraryArrives();
    await report;

    expect(calls().at(-1)).toEqual(["track", "PageVisit"]);
  });

  it("reports nothing when the tab has moved to another page meanwhile", async () => {
    const report = reportRedditEvent(PIXEL_ID, "/shop", PAGE_VISIT);
    tabIsOn("/parent/gamers/abc-123");

    libraryArrives();
    await report;

    expect(tracked()).toEqual([]);
  });

  it("loads nothing, let alone reports, when the query carries anything but campaign keys", async () => {
    tabIsOn("/login?redirect=/en/parent/gamers/abc-123");

    await reportRedditEvent(PIXEL_ID, "/login", PAGE_VISIT);

    expect(insertedScripts()).toHaveLength(0);
    expect(window.rdt).toBeUndefined();
  });

  it("reports nothing when the query turned private meanwhile", async () => {
    const report = reportRedditEvent(PIXEL_ID, "/login", PAGE_VISIT);
    tabIsOn("/login?redirect=/en/parent/gamers/abc-123");

    libraryArrives();
    await report;

    expect(tracked()).toEqual([]);
  });

  it("reports a page whose query is a Reddit ad link's", async () => {
    tabIsOn("/roblox?utm_source=reddit&rdt_cid=1234567890");
    const report = reportRedditEvent(PIXEL_ID, "/roblox", PAGE_VISIT);

    libraryArrives();
    await report;

    expect(calls().at(-1)).toEqual(["track", "PageVisit"]);
  });

  it("compares the pathname through the URL parser, encoded or not", async () => {
    tabIsOn("/fr/%C3%A0-propos");
    const report = reportRedditEvent(PIXEL_ID, "/fr/à-propos", PAGE_VISIT);

    libraryArrives();
    await report;

    expect(calls().at(-1)).toEqual(["track", "PageVisit"]);
  });

  it("reports nothing when the library never loads", async () => {
    const report = reportRedditEvent(PIXEL_ID, "/shop", PAGE_VISIT);

    libraryFails();
    await report;

    expect(tracked()).toEqual([]);
  });

  it("reports a product view with the product's own fields", async () => {
    tabIsOn("/shop/abc-123?utm_source=reddit");
    const report = reportRedditEvent(PIXEL_ID, "/shop/abc-123", PRODUCT_VIEW);

    libraryArrives();
    await report;

    expect(calls().at(-1)).toEqual(["track", "ViewContent", PRODUCT]);
  });

  it("reports no product view when the tab has moved on meanwhile", async () => {
    tabIsOn("/shop/abc-123");
    const report = reportRedditEvent(PIXEL_ID, "/shop/abc-123", PRODUCT_VIEW);
    tabIsOn("/parent/gamers/abc-123");

    libraryArrives();
    await report;

    expect(tracked()).toEqual([]);
  });
});

/**
 * The click's report: sent inside the caller's task or not at all. The click
 * usually navigates, so an event that waited would find the tab gone — and one
 * left in Reddit's queue would be replayed against the next page.
 */
describe("reportRedditEventNow", () => {
  const CHECKOUT_START: RedditBrowserEvent = {
    event: "AddToCart",
    product: { ...PRODUCT, value: 0 },
  };

  async function libraryIsHere() {
    const loaded = loadRedditPixel(PIXEL_ID);
    libraryArrives();
    await loaded;
  }

  it("sends synchronously once the library has arrived", async () => {
    tabIsOn("/shop/abc-123");
    await libraryIsHere();

    const sent = reportRedditEventNow("/shop/abc-123", CHECKOUT_START);

    expect(sent).toBe(true);
    expect(tracked()).toEqual([
      ["track", "AddToCart", { ...PRODUCT, value: 0 }],
    ]);
  });

  it("drops the event, rather than queueing it, while the library is still downloading", () => {
    tabIsOn("/shop/abc-123");
    void loadRedditPixel(PIXEL_ID);

    const sent = reportRedditEventNow("/shop/abc-123", CHECKOUT_START);
    libraryArrives();

    expect(sent).toBe(false);
    expect(tracked()).toEqual([]);
  });

  it("never starts a load of its own", () => {
    tabIsOn("/shop/abc-123");

    const sent = reportRedditEventNow("/shop/abc-123", CHECKOUT_START);

    expect(sent).toBe(false);
    expect(insertedScripts()).toHaveLength(0);
    expect(window.rdt).toBeUndefined();
  });

  it("sends nothing when the tab is not on the page that authorised it", async () => {
    tabIsOn("/shop/abc-123");
    await libraryIsHere();
    tabIsOn("/register");

    expect(reportRedditEventNow("/shop/abc-123", CHECKOUT_START)).toBe(false);
    expect(tracked()).toEqual([]);
  });

  it("sends nothing when the query carries anything but campaign keys", async () => {
    tabIsOn("/shop/abc-123");
    await libraryIsHere();
    tabIsOn("/shop/abc-123?redirect=/en/parent/gamers/abc-123");

    expect(reportRedditEventNow("/shop/abc-123", CHECKOUT_START)).toBe(false);
    expect(tracked()).toEqual([]);
  });
});
