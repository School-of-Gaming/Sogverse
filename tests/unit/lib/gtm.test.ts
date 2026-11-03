// @vitest-environment jsdom
//
// jsdom because the loader's whole job is to install a global and append a
// script element to a real document, and what it appends is the thing under
// test. Under node there is no `window` to install on, and the loader's own
// guard would make every case a silent no-op that still passed.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsentState } from "@/lib/consent";
import type { GtmEvent, GtmProductPageEvent } from "@/lib/gtm-events";
import { commandValues, isArgumentsObject } from "../../helpers/data-layer";
import { asObject } from "../../helpers/json";

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
 * Four of those things have teeth, and the order they sit in the queue is the
 * assertion for all four: the container reads the queue it finds on arrival
 * from the front, so an entry ahead of its own start signal is state it has
 * before it can fire anything, and an entry behind it is news that arrives too
 * late to constrain it.
 *
 *   - **The allow- and blocklists**, which forbid the container from bringing
 *     in code or a third party through the Tag Manager UI other than as a
 *     template, and forbid every one of Google's automatic trigger listeners —
 *     so nothing the visitor does after the page the container loaded on can
 *     fire a tag. They are the only control this repository keeps over a
 *     surface that is edited in a web form, with no review and no deploy.
 *   - **The template policy**, which bounds what an admitted template may do.
 *     Its decisions are pinned in `gtm-policy.test.ts`; what is pinned here is
 *     that it is registered, as a command, ahead of the container.
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

/** An event as a registration form pushes it. */
const SIGN_UP = {
  event: "sign_up",
  event_id: "3f2b7c1e-9a4d-4e8b-b6c5-0d1e2f3a4b5c",
  ecommerce: null,
  page_path: "/register",
} as const satisfies GtmEvent;

const ANALYTICS_ONLY: ConsentState = { ...GRANTED_BOTH, marketing: false };
const MARKETING_ONLY: ConsentState = { ...GRANTED_BOTH, analytics: false };

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
  delete window.fbq;
  delete window._fbq;
  delete window.rdt;
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
      "gtm.allowlist": ["google", "sandboxedScripts"],
      "gtm.blocklist": [
        "customScripts",
        "html",
        "nonGoogleScripts",
        "nonGooglePixels",
        "nonGoogleIframes",
        "customPixels",
        "k",
        "j",
        "d",
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

  // Each of these is in the `google` class the allowlist admits, so only its
  // own id can refuse it. The Supabase session cookies are readable by page
  // script, and a cookie variable typed into any admitted tag's field would
  // carry a parent's session to that tag's host; a JavaScript or DOM variable
  // reaches whatever the page holds.
  it("blocks the cookie, JavaScript and DOM element variables", () => {
    void gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);

    expect(queue()[0]).toMatchObject({
      "gtm.blocklist": expect.arrayContaining(["k", "j", "d"]),
    });
  });

  // Every one of Google's built-in auto-event listeners, named as a set rather
  // than read off the line above: a listener quietly dropped from the array is
  // a document-wide trigger back on a platform children sign into, and the
  // array's own assertion would go on passing as long as it matched itself.
  it("blocks every built-in auto-event listener, not just the history one", () => {
    void gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);

    expect(queue()[0]).toMatchObject({
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

  // `customScripts` is the Custom HTML tag and the Custom JavaScript variable,
  // and the four non-Google classes are the built-in tag types that send to a
  // host the configurer names. Under `'strict-dynamic'` anything the container
  // inserts is trusted by the CSP, so these are the whole of the fence for
  // everything that is not a template.
  it("blocks every class that could bring in code or a third party outside a template", () => {
    void gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);

    expect(queue()[0]).toMatchObject({
      "gtm.blocklist": expect.arrayContaining([
        "customScripts",
        "html",
        "nonGoogleScripts",
        "nonGooglePixels",
        "nonGoogleIframes",
        "customPixels",
      ]),
    });
  });

  // Meta's and Reddit's tags exist only as gallery templates, and a template's
  // one class is implicitly blocked whenever any class is blocklisted, unless
  // the allowlist names it. A blocklist wins over an allowlist, so the class
  // must be absent from the blocklist too — and an allowlist refuses what it
  // does not name, so Google's own class has to be named beside it.
  it("admits templates and Google's own tags, and nothing else by class", () => {
    void gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);

    const fence = asObject(queue()[0]);
    expect(fence["gtm.allowlist"]).toEqual(["google", "sandboxedScripts"]);
    expect(fence["gtm.blocklist"]).not.toContain("sandboxedScripts");
    expect(fence["gtm.blocklist"]).not.toContain("google");
  });

  it("registers the template policy, as a command, for every permission", async () => {
    void gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);
    const { containerPolicy } = await import("@/lib/gtm-policy");

    expect(isArgumentsObject(queue()[1])).toBe(true);
    expect(commandValues(queue()[1])).toEqual(["policy", "all", containerPolicy]);
  });

  it("denies every signal by default, then grants what the visitor gave", () => {
    void gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);

    expect(commandValues(queue()[2])).toEqual([
      "consent",
      "default",
      {
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        analytics_storage: "denied",
      },
    ]);
    expect(commandValues(queue()[3])).toEqual([
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
  // Analytics is Vercel's cookieless counting and nothing in the container, so
  // granting it alone grants the container nothing, `analytics_storage`
  // included.
  it("denies every signal when analytics is granted without marketing", () => {
    void gtm.loadGtm(CONTAINER_ID, ANALYTICS_ONLY);

    expect(commandValues(queue()[3])).toEqual([
      "consent",
      "update",
      {
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        analytics_storage: "denied",
      },
    ]);
  });

  // The container belongs wholly to marketing, so a visitor who granted
  // marketing and refused analytics has granted everything it stores.
  it("grants every signal when marketing is granted without analytics", () => {
    void gtm.loadGtm(CONTAINER_ID, MARKETING_ONLY);

    expect(commandValues(queue()[3])).toEqual([
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

  // Invisible on the page, total on the wire: an array of the same three values
  // is merged into the data model as `{0: …, 1: …, 2: …}` and the command is
  // never seen.
  it("pushes each consent command as an arguments object, never an array", () => {
    void gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);

    for (const entry of [queue()[2], queue()[3]]) {
      expect(isArgumentsObject(entry)).toBe(true);
      expect(Array.isArray(entry)).toBe(false);
    }
  });

  // The container reads the queue it finds from the front, so everything that
  // constrains it has to be ahead of the signal that starts it.
  it("puts the fence, the policy and the consent state ahead of the container's start", () => {
    void gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);

    const start = queue().findIndex(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        "gtm.start" in entry,
    );
    expect(start).toBe(4);
  });

  // A vendor template looks for its global and builds its own when it finds
  // none, without our flags — so the globals must exist before the container
  // can run a tag, which is before its script is in the document.
  it("installs the Meta and Reddit globals before inserting the container", () => {
    const append = document.head.appendChild.bind(document.head);
    let globalsAtInsert: unknown[] = [];
    const spy = vi
      .spyOn(document.head, "appendChild")
      .mockImplementation(<T extends Node>(node: T): T => {
        globalsAtInsert = [window.fbq, window.rdt];
        return append(node);
      });

    void gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);
    spy.mockRestore();

    expect(globalsAtInsert.every((global) => typeof global === "function")).toBe(
      true,
    );
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
    delete window.fbq;
    delete window._fbq;
    delete window.rdt;
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
    gtm.pushGtmEvent(SIGN_UP);

    expect(window.dataLayer).toBeUndefined();
  });

  it("pushes while the container is still downloading", () => {
    void gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);

    gtm.pushGtmEvent(SIGN_UP);

    expect(queue().at(-1)).toEqual(SIGN_UP);
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

    gtm.pushGtmEvent(SIGN_UP);

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
      event_id: expect.any(String),
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
      event_id: expect.any(String),
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
      event_id: expect.any(String),
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
      event_id: expect.any(String),
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

  // Each view is its own event to a platform that deduplicates by id: two
  // views sharing one would have the second discarded.
  it("gives every page view an id of its own", async () => {
    const first = gtm.reportGtmPageView(CONTAINER_ID, "/shop", GRANTED_BOTH);
    containerArrives();
    await first;
    await gtm.reportGtmPageView(CONTAINER_ID, "/shop", GRANTED_BOTH);

    const ids = queue()
      .filter((entry) => hasEventName(entry, "page_view"))
      .map((entry) => asObject(entry).event_id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });
});

/** A product page's own events, as the consent components hand them over. */
const VIEW_ITEM = {
  event: "view_item",
  ecommerce: {
    items: [
      {
        item_id: "abc-123",
        item_name: "Roblox Studio Club",
        item_category: "roblox_studio",
        price: 49,
        quantity: 1,
      },
    ],
    value: 49,
    currency: "EUR",
  },
  advertised: true,
} as const satisfies GtmProductPageEvent;

/** The same product in the object Meta's template takes whole. */
const VIEW_ITEM_META = {
  content_ids: ["abc-123"],
  content_type: "product",
  content_name: "Roblox Studio Club",
  content_category: "roblox_studio",
  value: 49,
  currency: "EUR",
};

const ADD_TO_CART = {
  ...VIEW_ITEM,
  event: "add_to_cart",
} as const satisfies GtmProductPageEvent;

/**
 * The product view travels the page view's whole road — the container, the
 * address-bar re-check, the internal path — because it is reported from the
 * same page on the same terms.
 */
describe("reportGtmProductEvent", () => {
  const GATE = { containerId: CONTAINER_ID, consent: GRANTED_BOTH };

  it("loads the container and reports once it has arrived", async () => {
    tabIsOn("/fi/kauppa/abc-123");
    const report = gtm.reportGtmProductEvent(GATE, "/fi/kauppa/abc-123", VIEW_ITEM);

    expect(insertedScripts()).toHaveLength(1);
    expect(queue().some((entry) => hasEventName(entry, "view_item"))).toBe(
      false,
    );

    containerArrives();
    await report;

    expect(queue().at(-1)).toEqual({
      ...VIEW_ITEM,
      meta: VIEW_ITEM_META,
      event_id: expect.any(String),
      page_path: "/shop/abc-123",
    });
  });

  it("reports nothing when the tab has moved to another page meanwhile", async () => {
    tabIsOn("/shop/abc-123");
    const report = gtm.reportGtmProductEvent(GATE, "/shop/abc-123", VIEW_ITEM);
    tabIsOn("/parent/gamers/abc-123");

    containerArrives();
    await report;

    expect(queue().some((entry) => hasEventName(entry, "view_item"))).toBe(
      false,
    );
  });
});

/**
 * The click into the sign-up flow goes out inside the click or not at all,
 * with the same address-bar check the views get, made at that moment.
 */
describe("pushGtmProductEventNow", () => {
  it("pushes nothing and says so when no container is coming", () => {
    tabIsOn("/shop/abc-123");

    expect(gtm.pushGtmProductEventNow("/shop/abc-123", ADD_TO_CART)).toBe(false);
    expect(window.dataLayer).toBeUndefined();
  });

  // Unlike a pixel's click, it may sit in the queue: it names its own page.
  it("pushes while the container is still downloading, naming its page", () => {
    tabIsOn("/fi/kauppa/abc-123");
    void gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);

    expect(gtm.pushGtmProductEventNow("/fi/kauppa/abc-123", ADD_TO_CART)).toBe(
      true,
    );
    expect(queue().at(-1)).toEqual({
      ...ADD_TO_CART,
      meta: VIEW_ITEM_META,
      event_id: expect.any(String),
      page_path: "/shop/abc-123",
    });
  });

  it("pushes nothing when the tab is no longer on the page", () => {
    tabIsOn("/parent/gamers/abc-123");
    void gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);

    expect(gtm.pushGtmProductEventNow("/shop/abc-123", ADD_TO_CART)).toBe(false);
    expect(queue().some((entry) => hasEventName(entry, "add_to_cart"))).toBe(
      false,
    );
  });

  it("pushes nothing when the query may not travel", () => {
    tabIsOn("/shop/abc-123?token=secret");
    void gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);

    expect(gtm.pushGtmProductEventNow("/shop/abc-123", ADD_TO_CART)).toBe(false);
  });
});

/**
 * Each of the browser's three moments is posted to our server once its push
 * has gone out, under the push's own id and with the page as the address bar
 * held it — and never when the push did not go.
 */
describe("the server twin", () => {
  type FetchCall = (input: string, init: RequestInit) => Promise<Response>;
  let fetchMock: ReturnType<typeof vi.fn<FetchCall>>;

  beforeEach(() => {
    fetchMock = vi
      .fn<FetchCall>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** The bodies posted to the page-event route, in order. */
  function twins(): Record<string, unknown>[] {
    return fetchMock.mock.calls.map(([url, init]) => {
      expect(url).toBe("/api/page-events");
      expect(init.keepalive).toBe(true);
      return asObject(JSON.parse(String(init.body)));
    });
  }

  /** The id the last push into the queue carried. */
  function lastPushedId(): unknown {
    return asObject(queue().at(-1)).event_id;
  }

  it("posts a page view with its id and the raw page and vetted query", async () => {
    tabIsOn("/fi/kauppa?utm_source=meta");
    const report = gtm.reportGtmPageView(
      CONTAINER_ID,
      "/fi/kauppa",
      GRANTED_BOTH,
    );
    containerArrives();
    await report;

    expect(twins()).toEqual([
      {
        event: "page_view",
        eventId: lastPushedId(),
        pagePath: "/fi/kauppa?utm_source=meta",
      },
    ]);
  });

  it("posts a product view naming its product", async () => {
    tabIsOn("/fi/kauppa/abc-123");
    const report = gtm.reportGtmProductEvent(
      { containerId: CONTAINER_ID, consent: GRANTED_BOTH },
      "/fi/kauppa/abc-123",
      VIEW_ITEM,
    );
    containerArrives();
    await report;

    expect(twins()).toEqual([
      {
        event: "view_item",
        eventId: lastPushedId(),
        pagePath: "/fi/kauppa/abc-123",
        productId: "abc-123",
      },
    ]);
  });

  it("posts a checkout start inside the click", () => {
    tabIsOn("/fi/kauppa/abc-123");
    void gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);

    gtm.pushGtmProductEventNow("/fi/kauppa/abc-123", ADD_TO_CART);

    expect(twins()).toEqual([
      {
        event: "add_to_cart",
        eventId: lastPushedId(),
        pagePath: "/fi/kauppa/abc-123",
        productId: "abc-123",
      },
    ]);
  });

  it("posts nothing for a product we do not advertise", () => {
    tabIsOn("/shop/abc-123");
    void gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);

    expect(
      gtm.pushGtmProductEventNow("/shop/abc-123", {
        ...ADD_TO_CART,
        advertised: false,
      }),
    ).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts nothing when the push did not go out", async () => {
    tabIsOn("/shop/abc-123");
    gtm.pushGtmProductEventNow("/shop/abc-123", ADD_TO_CART);

    const report = gtm.reportGtmPageView(CONTAINER_ID, "/shop", GRANTED_BOTH);
    containerFails();
    await report;

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts nothing for an event the routes that commit it report", () => {
    void gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);

    gtm.pushGtmEvent(SIGN_UP);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * The container keeps one data model that every push is merged into, so a
 * field one event leaves out reads whatever the last event said. The reset is
 * what makes each event state its own product or none.
 */
describe("the ecommerce reset", () => {
  it("clears the product immediately before every event", () => {
    void gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);

    gtm.pushGtmEvent(SIGN_UP);

    expect(queue().slice(-2)).toEqual([{ ecommerce: null, meta: null }, SIGN_UP]);
  });

  // Meta's template takes the whole object through one variable, so it is the
  // product exactly as `ecommerce` names it — and gone again by the next push,
  // since the data model merges a list index by index.
  it("names a product for Meta's template beside the ecommerce object", () => {
    void gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);
    const event = { ...VIEW_ITEM, event_id: "e1", page_path: "/shop/abc-123" };

    gtm.pushGtmEvent(event);
    gtm.pushGtmEvent(SIGN_UP);

    expect(queue().slice(-4)).toEqual([
      { ecommerce: null, meta: null },
      {
        ...event,
        meta: VIEW_ITEM_META,
      },
      { ecommerce: null, meta: null },
      SIGN_UP,
    ]);
  });

  // A lead and a queue place are pushed unpriced, and Meta's object follows.
  it("leaves Meta's object unpriced when the push is", () => {
    void gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);

    gtm.pushGtmEvent({
      ...SIGN_UP,
      ecommerce: {
        items: [
          {
            item_id: "abc-123",
            item_name: "Roblox Studio Club",
            item_category: "roblox_studio",
            quantity: 1,
          },
        ],
      },
    });

    expect(asObject(queue().at(-1)).meta).toEqual({
      content_ids: ["abc-123"],
      content_type: "product",
      content_name: "Roblox Studio Club",
      content_category: "roblox_studio",
    });
  });

  it("says whether a container is coming", () => {
    expect(gtm.isGtmArmed()).toBe(false);
    void gtm.loadGtm(CONTAINER_ID, GRANTED_BOTH);
    expect(gtm.isGtmArmed()).toBe(true);
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
 * Stickiness is also why the pin is decided on different grounds from the
 * report. Refusing to pin is not silence — it leaves the live document named —
 * so once a container exists, the choice is only ever which page the
 * unsuppressable events carry, and the answer is the marketing page the caller
 * vetted. The cases below that assert nothing is pinned are therefore about the
 * guards that run *before* a container is ever asked for, and they say so.
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

  // Queue order is the assertion, the same way it is for the fence and the
  // consent state: the data model is read in order, so a `set` behind the page
  // view would leave that page view read against whatever location the model
  // held before it. The order is right today and nothing else states it, so a
  // later reshuffle of the two pushes would change what the report means
  // without changing what either line says.
  it("pins the page before it pushes the page view, never after", async () => {
    const report = gtm.reportGtmPageView(CONTAINER_ID, "/shop", GRANTED_BOTH);

    containerArrives();
    await report;

    const pin = queue().findIndex((entry) => commandValues(entry)[0] === "set");
    const view = queue().findIndex((entry) => hasEventName(entry, "page_view"));
    expect(pin).toBeGreaterThanOrEqual(0);
    expect(view).toBeGreaterThanOrEqual(0);
    expect(pin).toBeLessThan(view);
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

  // The pinned location carries the query the allowlist approved, because that
  // allowlist is the same one that permits the report at all — and the campaign
  // parameters and click ids in it are what the analytics property derives its
  // attribution from. A query-less pin would strip every later event of its
  // campaign to protect a value the policy had already cleared, and it would
  // show up only in a reporting property weeks later.
  it("keeps an ad link's campaign parameters in the pinned location", async () => {
    tabIsOn("/roblox?utm_source=lynx&utm_campaign=spring-clubs&gclid=abc123");
    const report = gtm.reportGtmPageView(CONTAINER_ID, "/roblox", GRANTED_BOTH);

    containerArrives();
    await report;

    expect(pinnedPage()).toEqual({
      page_location: `${window.location.origin}/roblox?utm_source=lynx&utm_campaign=spring-clubs&gclid=abc123`,
      page_title: "Sogverse",
    });
  });

  // A product page's "create an account" link: the redirect names a marketing
  // page, so it passes the gate before the load, the pin and the re-check.
  it("reports and pins a register page whose redirect is a product page", async () => {
    tabIsOn("/register?redirect=/fr/boutique/abc-123");
    const report = gtm.reportGtmPageView(CONTAINER_ID, "/register", GRANTED_BOTH);

    containerArrives();
    await report;

    expect(pinnedPage()).toEqual({
      page_location: `${window.location.origin}/register?redirect=/fr/boutique/abc-123`,
      page_title: "Sogverse",
    });
    expect(queue().at(-1)).toEqual({
      event: "page_view",
      event_id: expect.any(String),
      page_path: "/register",
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
  // query names a child. A guard-placement regression test rather than pin
  // coverage — the pin cannot exist here however it is written, because the
  // refusal happens before a container is ever asked for, and the assertion is
  // that the refusal stays that early.
  it("asks for no container at all when the query may not travel", async () => {
    tabIsOn("/login?redirect=/en/parent/gamers/abc-123");

    await gtm.reportGtmPageView(CONTAINER_ID, "/login", GRANTED_BOTH);

    expect(insertedScripts()).toHaveLength(0);
    expect(window.dataLayer).toBeUndefined();
  });

  // The case the whole defect is about, and the most valuable one here: the
  // visitor left the shop for a child's page while the container was still
  // downloading. The container is now loaded and gtag's engagement timer is
  // running, so there is no such thing as not answering — pinning nothing
  // leaves the child's URL as the page gtag will report on unload. So the pin
  // is present and names the shop the visitor genuinely came from, while the
  // page view is still refused: the tab moved, and a report is a claim about
  // where the tab is.
  it("pins the page it was authorised for when the tab moved on during the load", async () => {
    const report = gtm.reportGtmPageView(CONTAINER_ID, "/shop", GRANTED_BOTH);
    tabIsOn("/parent/gamers/abc-123");

    containerArrives();
    await report;

    expect(pinnedPage()).toEqual({
      page_location: `${window.location.origin}/shop`,
      page_title: "Sogverse",
    });
    expect(queue().some((entry) => hasEventName(entry, "page_view"))).toBe(
      false,
    );
  });

  // The other guard that runs ahead of the load, and the same kind of test:
  // what it holds in place is that an unknown URL is refused before a container
  // is requested, not that the pin declined to name it.
  it("asks for no container at all for a URL that matches no route", async () => {
    tabIsOn("/not-a-page-we-have");

    await gtm.reportGtmPageView(
      CONTAINER_ID,
      "/not-a-page-we-have",
      GRANTED_BOTH,
    );

    expect(insertedScripts()).toHaveLength(0);
    expect(window.dataLayer).toBeUndefined();
  });

  // Nothing may be queued for a container that will never arrive — an ad
  // blocker refused it, so the queue is a global array nothing will read. The
  // container being asked for is asserted alongside: without it the empty list
  // would be equally true of a build with no pin in it at all, and this case
  // is the one that holds the pin behind the load rather than before it.
  it("pins nothing when the container it asked for never loads", async () => {
    const report = gtm.reportGtmPageView(CONTAINER_ID, "/shop", GRANTED_BOTH);

    containerFails();
    await report;

    expect(insertedScripts()).toHaveLength(1);
    expect(setEntries()).toHaveLength(0);
  });
});
