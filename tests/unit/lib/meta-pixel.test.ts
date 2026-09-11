// @vitest-environment jsdom
//
// jsdom because the loader's whole job is to install a global and append a
// script element to a real document, and what it appends is the thing under
// test. Under node there is no `window` to install on, and the loader's own
// guard would make every case a silent no-op that still passed.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadMetaPixel, trackMetaEvent } from "@/lib/meta-pixel";

/**
 * ============================================================================
 * The Meta Pixel loader: Meta's base code, minus the part that reports.
 * ============================================================================
 *
 * The official snippet loads the library and reports a PageView in the same
 * breath, which is exactly what this app cannot have: the page has to be checked
 * against the marketing-page allowlist first, and a PageView fused into loading
 * is one nobody chose. So the two are split, and the load half is what is pinned
 * here — that it queues, that it inserts the library once, and above all that it
 * sets the three flags that decide what the library does on its own afterwards.
 *
 * `autoConfig` is the one with teeth. Left on, the pixel takes its behaviour
 * from whatever is switched on in the Meta Ads dashboard — including Automatic
 * Advanced Matching, which scrapes form fields and hashes email addresses and
 * phone numbers into every event. Our privacy copy says what Meta receives, and
 * a setting in someone else's dashboard must not be able to make that sentence
 * false. It only takes effect *before* `init`, so the order is the assertion.
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

beforeEach(() => {
  // A fresh document and a fresh global: the loader's first guard is
  // `window.fbq`, so a stub left behind by the previous case would make the
  // next one assert about nothing.
  delete window.fbq;
  delete window._fbq;
  document.head.innerHTML = "";
});

afterEach(() => {
  delete window.fbq;
  delete window._fbq;
});

describe("loadMetaPixel", () => {
  it("installs Meta's queueing stub", () => {
    loadMetaPixel(PIXEL_ID);

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
    loadMetaPixel(PIXEL_ID);

    const scripts = insertedScripts();
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe(
      "https://connect.facebook.net/en_US/fbevents.js",
    );
    expect(scripts[0].async).toBe(true);
  });

  it("sets the two behaviour flags the design rests on", () => {
    loadMetaPixel(PIXEL_ID);

    // No automatic PageView on a client-side navigation — which is what keeps
    // the pixel silent on the private and token-carrying pages a visitor
    // reaches without a new document.
    expect(window.fbq?.disablePushState).toBe(true);
    // And no suppression of the second PageView in one document: a visitor
    // walking several marketing pages is several page views.
    expect(window.fbq?.allowDuplicatePageViews).toBe(true);
  });

  it("turns autoConfig off BEFORE initialising the pixel", () => {
    loadMetaPixel(PIXEL_ID);

    expect(calls()).toEqual([
      ["set", "autoConfig", false, PIXEL_ID],
      ["init", PIXEL_ID],
    ]);
  });

  it("never reports a page view of its own", () => {
    loadMetaPixel(PIXEL_ID);

    expect(calls().some(([method]) => method === "track")).toBe(false);
  });

  it("is a no-op when the pixel is already installed", () => {
    loadMetaPixel(PIXEL_ID);
    const first = window.fbq;

    loadMetaPixel(PIXEL_ID);

    expect(window.fbq).toBe(first);
    expect(insertedScripts()).toHaveLength(1);
    expect(calls()).toHaveLength(2);
  });
});

describe("trackMetaEvent", () => {
  it("queues the event through the stub", () => {
    loadMetaPixel(PIXEL_ID);

    trackMetaEvent("PageView");

    expect(calls().at(-1)).toEqual(["track", "PageView"]);
  });

  // The property that keeps every call site free of its own gate: with no pixel
  // on the page there is no global to call, and asking for one is not an error.
  it("does nothing at all when no pixel is loaded", () => {
    expect(() => trackMetaEvent("PageView")).not.toThrow();
    expect(window.fbq).toBeUndefined();
  });
});
