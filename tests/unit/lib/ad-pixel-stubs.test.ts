// @vitest-environment jsdom
//
// jsdom because the stubs are window globals by definition, the Reddit stub
// appends a script element to a real document, and what a held report is
// checked against is the address bar.

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ============================================================================
 * The Meta and Reddit globals the container's tags find.
 * ============================================================================
 *
 * Both vendors' gallery templates use an existing global before building their
 * own, so these stubs are what every Meta and Reddit tag in the container
 * calls. The libraries themselves never load here — jsdom fetches nothing —
 * so a library's arrival is played by hand, the way each one announces itself:
 * Meta's by assigning `callMethod` on the global, Reddit's by assigning
 * `sendEvent`.
 */

type Stubs = typeof import("@/lib/ad-pixel-stubs");
let stubs: Stubs;

function tabIsOn(url: string) {
  window.history.pushState({}, "", url);
}

/** Let the release that follows a library's arrival run. */
async function settle() {
  await Promise.resolve();
}

function fbq(...args: unknown[]) {
  const global = window.fbq;
  if (global === undefined) throw new Error("no fbq");
  global(...args);
}

function rdt(...args: unknown[]) {
  const global = window.rdt;
  if (global === undefined) throw new Error("no rdt");
  global(...args);
}

/** Meta's library arriving: it installs its dispatcher on the global. */
function metaLibraryArrives(): ReturnType<typeof vi.fn> {
  const dispatch = vi.fn();
  if (window.fbq === undefined) throw new Error("no fbq");
  window.fbq.callMethod = dispatch;
  return dispatch;
}

/** Reddit's library arriving, the same way under its own name. */
function redditLibraryArrives(): ReturnType<typeof vi.fn> {
  const dispatch = vi.fn();
  if (window.rdt === undefined) throw new Error("no rdt");
  window.rdt.sendEvent = dispatch;
  return dispatch;
}

function redditScripts(): HTMLScriptElement[] {
  return Array.from(
    document.querySelectorAll<HTMLScriptElement>('script[src*="redditstatic"]'),
  );
}

beforeEach(async () => {
  vi.resetModules();
  delete window.fbq;
  delete window._fbq;
  delete window.rdt;
  document.head.innerHTML = "";
  tabIsOn("/shop");
  stubs = await import("@/lib/ad-pixel-stubs");
  stubs.installAdPixelStubs();
});

describe("the Meta global", () => {
  // The library reads these off the global it finds. Navigation reporting off
  // is the gate the whole design rests on: left on, every client navigation —
  // into a child's page, out of a reset link — is a PageView.
  it("says disablePushState and allowDuplicatePageViews, and cannot be talked out of either", () => {
    const global = window.fbq;
    expect(global?.disablePushState).toBe(true);
    expect(global?.allowDuplicatePageViews).toBe(true);

    if (global === undefined) throw new Error("no fbq");
    global.disablePushState = false;
    global.allowDuplicatePageViews = false;

    expect(global.disablePushState).toBe(true);
    expect(global.allowDuplicatePageViews).toBe(true);
  });

  it("looks like Meta's own stub to the library", () => {
    expect(window.fbq?.loaded).toBe(true);
    expect(window.fbq?.version).toBe("2.0");
    expect(window.fbq?.push).toBe(window.fbq);
    expect(window._fbq).toBe(window.fbq);
    expect(window.fbq?.queue).toEqual([]);
  });

  // Before `init`, which is when the library reads it, and whatever the tag's
  // own box said — so Meta's dashboard cannot turn on form scraping.
  it("turns autoConfig off ahead of every pixel's first init", async () => {
    fbq("init", "111");
    fbq("init", "222");
    fbq("init", "111");
    const dispatch = metaLibraryArrives();
    await settle();

    expect(dispatch.mock.calls).toEqual([
      ["set", "autoConfig", false, "111"],
      ["init", "111"],
      ["set", "autoConfig", false, "222"],
      ["init", "222"],
      ["init", "111"],
    ]);
  });

  it("releases a report made on the page the tab is still on", async () => {
    fbq("init", "111");
    fbq("trackSingle", "111", "PageView", {}, { eventID: "e1" });
    const dispatch = metaLibraryArrives();
    await settle();

    expect(dispatch).toHaveBeenCalledWith(
      "trackSingle",
      "111",
      "PageView",
      {},
      { eventID: "e1" },
    );
  });

  // The library would replay a queued report against the URL the tab shows
  // when it arrives; a visitor who walked into a child's page meanwhile would
  // have that page reported.
  it("drops a report made on a page the tab has since left, and keeps the rest", async () => {
    fbq("consent", "grant");
    fbq("init", "111");
    fbq("trackSingle", "111", "PageView");
    fbq("track", "ViewContent");
    tabIsOn("/parent/gamers/0d9c6b8e-1f2a-4b3c-8d4e-5f6a7b8c9d0e");
    const dispatch = metaLibraryArrives();
    await settle();

    expect(dispatch.mock.calls).toEqual([
      ["consent", "grant"],
      ["set", "autoConfig", false, "111"],
      ["init", "111"],
    ]);
  });

  it("treats a change of query as leaving the page", async () => {
    fbq("track", "PageView");
    tabIsOn("/shop?reset_token=secret");
    const dispatch = metaLibraryArrives();
    await settle();

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("calls the library straight through once it has arrived, with the global as this", async () => {
    const dispatch = metaLibraryArrives();
    await settle();

    fbq("track", "PageView");

    expect(dispatch).toHaveBeenCalledWith("track", "PageView");
    expect(dispatch.mock.contexts[0]).toBe(window.fbq);
  });

  it("is installed once and never replaced", () => {
    const first = window.fbq;
    stubs.installAdPixelStubs();
    expect(window.fbq).toBe(first);
  });
});

describe("the Reddit global", () => {
  it("loads nothing until a tag calls it", () => {
    expect(redditScripts()).toHaveLength(0);
  });

  // Reddit's template asks for the copy carrying the Events Manager
  // configuration; the container's policy refuses that, and this is the copy
  // that loads instead — the one whose configuration fetch the CSP refuses.
  it("loads the generic library, once, on the first call", () => {
    rdt("init", "a2_abc123");
    rdt("track", "PageVisit");

    const scripts = redditScripts();
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe("https://www.redditstatic.com/ads/pixel.js");
    expect(scripts[0].async).toBe(true);
  });

  it("releases its calls on arrival, dropping a report whose page the tab has left", async () => {
    rdt("init", "a2_abc123");
    rdt("disableFirstPartyCookies");
    rdt("track", "PageVisit");
    tabIsOn("/reset-password?token=secret");
    const dispatch = redditLibraryArrives();
    await settle();

    expect(dispatch.mock.calls).toEqual([
      ["init", "a2_abc123"],
      ["disableFirstPartyCookies"],
    ]);
  });

  it("releases a report made on the page the tab is still on", async () => {
    rdt("init", "a2_abc123");
    rdt("track", "ViewContent", { conversionId: "e1" });
    const dispatch = redditLibraryArrives();
    await settle();

    expect(dispatch).toHaveBeenLastCalledWith("track", "ViewContent", {
      conversionId: "e1",
    });
  });

  it("keeps an empty queue for the library to drain", () => {
    rdt("track", "PageVisit");
    expect(window.rdt?.callQueue).toEqual([]);
  });
});

/**
 * Everything above rests on each library announcing itself by assigning its
 * dispatcher. A library that loads and never does leaves every call held and
 * reports nothing, with no error anywhere — so outside production the stub
 * says so in the console.
 */
describe("a library the stub never notices", () => {
  /** A script element's load, the way the browser announces it. */
  function scriptLoads(script: HTMLScriptElement) {
    script.dispatchEvent(new Event("load"));
  }

  /** Meta's template inserting its library, as it does under the container. */
  function metaScript(): HTMLScriptElement {
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
    return script;
  }

  /** Let the check that follows a load run. */
  async function nextTick() {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it("warns when Meta's library loads and never installs its dispatcher", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    scriptLoads(metaScript());
    await nextTick();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("Meta");
    warn.mockRestore();
  });

  it("says nothing when Meta's library announces itself", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const script = metaScript();
    metaLibraryArrives();
    scriptLoads(script);
    await nextTick();

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("warns when Reddit's library loads and never installs its dispatcher", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    rdt("track", "PageVisit");
    scriptLoads(redditScripts()[0]);
    await nextTick();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("Reddit");
    warn.mockRestore();
  });

  it("says nothing when Reddit's library announces itself", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    rdt("track", "PageVisit");
    redditLibraryArrives();
    scriptLoads(redditScripts()[0]);
    await nextTick();

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
