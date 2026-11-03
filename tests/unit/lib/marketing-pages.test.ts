import { describe, expect, it } from "vitest";
import { PATHNAMES } from "@/i18n/pathnames";
import {
  isMarketingPage,
  isReportableQuery,
  MARKETING_PAGES,
  reportableMarketingPage,
} from "@/lib/marketing-pages";

/**
 * ============================================================================
 * The marketing-page allowlist: what the pixel is allowed to see.
 * ============================================================================
 *
 * This list is the only thing standing between an advertising platform and the
 * URLs of pages that carry a single-use token or name a child — the pixel
 * reports the page URL and the document's referrer with every event, so a page
 * on this list is a page whose address we are content for Meta to hold.
 *
 * There is deliberately no completeness check demanding that every route be
 * classified: a page missing from the list gets no pixel, which is the safe
 * direction. What *is* worth pinning is the other direction — every entry names
 * a route that exists, and the pages that must never be on it are not.
 */
describe("the marketing-page allowlist", () => {
  it("names only routes the app actually declares", () => {
    for (const template of MARKETING_PAGES) {
      expect(Object.keys(PATHNAMES)).toContain(template);
    }
  });

  it("admits the pages an ad can send a stranger to", () => {
    for (const template of MARKETING_PAGES) {
      expect(isMarketingPage(template)).toBe(true);
    }
  });

  // The four token-carrying pages and two that name a person. None of them is a
  // page an ad links to, and each would put a secret or an id into a URL
  // reported to Meta. They are asserted to exist first, so this file fails if
  // one is renamed rather than quietly asserting about a route that is gone.
  it.each([
    "/reset-password",
    "/reset-pin",
    "/verify-email",
    "/seat-offer",
    "/parent/gamers/[id]",
    "/parent",
  ] as const)("refuses %s", (template) => {
    expect(Object.keys(PATHNAMES)).toContain(template);
    expect(isMarketingPage(template)).toBe(false);
  });

  // A URL matching no route at all — a 404, or something a scanner invented. It
  // is the last thing that should be reported anywhere, and `null` is what the
  // path normalizer answers with for it.
  it("refuses a path that matched no route", () => {
    expect(isMarketingPage(null)).toBe(false);
  });
});

describe("the reportable-query allowlist", () => {
  // The pathname is on the allowlist; the query is what the library also
  // reports, and the proxy puts a private path into it on two marketing pages.
  it("admits an empty query and the keys an ad link carries", () => {
    expect(isReportableQuery("")).toBe(true);
    expect(isReportableQuery("?")).toBe(true);
    expect(
      isReportableQuery(
        "?utm_source=lynx&utm_medium=email&utm_campaign=lynx-summer-a&fbclid=IwAR0abc",
      ),
    ).toBe(true);
    // Reddit's click id, which its library reads off the landing URL.
    expect(isReportableQuery("?utm_source=reddit&rdt_cid=1234567890")).toBe(
      true,
    );
  });

  it("admits the shop's own filter state", () => {
    expect(isReportableQuery("?category=club&topic=minecraft&age=10")).toBe(
      true,
    );
  });

  it("refuses the proxy's redirect back to a private page", () => {
    expect(isReportableQuery("?redirect=/en/parent/gamers/abc-123")).toBe(
      false,
    );
    // One bad key among good ones is still a refusal.
    expect(
      isReportableQuery("?utm_source=lynx&redirect=/en/parent/gamers/abc-123"),
    ).toBe(false);
  });

  // A product page's "create an account" link and a landing page's guide link
  // carry the page the parent left; that value is itself a marketing page.
  describe("a redirect back to a marketing page", () => {
    const productId = "3f0c2a9e-7b1d-4c5e-9a8f-2d6b4e1c0a7f";
    const gamerId = "8b2e6f14-0c3a-4d7b-b915-6a4e2c8d1f03";

    it.each([
      `?redirect=/fr/boutique/${productId}`,
      `?redirect=/shop/${productId}`,
      "?redirect=/discover/minecraft-summer",
      "?redirect=/fr/decouvrir/minecraft-ete",
      "?redirect=/fr/roblox",
      "?redirect=/",
      `?redirect=${encodeURIComponent(`/fi/kauppa/${productId}?utm_source=meta&fbclid=IwAR0abc`)}`,
      `?utm_source=meta&redirect=/fr/boutique/${productId}`,
    ])("admits %s", (search) => {
      expect(isReportableQuery(search)).toBe(true);
    });

    it.each([
      // A child's page, and a dashboard.
      `?redirect=/en/parent/gamers/${gamerId}`,
      `?redirect=/parent/gamers/${gamerId}`,
      "?redirect=/fr/parent",
      // Off-site, however it is spelled.
      "?redirect=https://evil.com/shop",
      "?redirect=//evil.com/shop",
      `?redirect=${encodeURIComponent("/\\evil.com")}`,
      // A path matching no route, and an empty value.
      "?redirect=/nowhere/at/all",
      "?redirect=",
      // A marketing page whose own query or fragment may not travel.
      `?redirect=${encodeURIComponent(`/fr/boutique/${productId}?token=abc`)}`,
      `?redirect=${encodeURIComponent(`/fr/boutique/${productId}#token`)}`,
      // No recursion: a redirect inside a redirect refuses, even to a product.
      `?redirect=${encodeURIComponent(`/fr/register?redirect=/fr/boutique/${productId}`)}`,
      // What is matched must be what is reported: a value the parser or the
      // matcher would rewrite into a marketing page names a child as written.
      `?redirect=/parent/gamers/${gamerId}/../../../fr/boutique/x`,
      `?redirect=/parent/gamers/${gamerId}/%2e%2e/%2e%2e/%2e%2e/fr/boutique/x`,
      `?redirect=${encodeURIComponent(`/parent\\gamers\\${gamerId}\\..\\..\\..\\fr\\boutique\\x`)}`,
      `?redirect=/fr/boutique/a%252Fparent%252Fgamers%252F${gamerId}`,
      `?redirect=/fr//boutique/${productId}`,
      `?redirect=/fr/boutique/${productId}/`,
      `?redirect=/fr/boutique/${productId}/.`,
    ])("refuses %s", (search) => {
      expect(isReportableQuery(search)).toBe(false);
    });

    // Every occurrence of a repeated key is checked, whichever a reader takes.
    it("checks every occurrence of a repeated redirect", () => {
      expect(
        isReportableQuery(
          `?redirect=/fr/boutique/${productId}&redirect=/discover/minecraft-summer`,
        ),
      ).toBe(true);
      expect(
        isReportableQuery(
          `?redirect=/fr/boutique/${productId}&redirect=/parent/gamers/${gamerId}`,
        ),
      ).toBe(false);
      expect(
        isReportableQuery(
          `?redirect=/parent/gamers/${gamerId}&redirect=/fr/boutique/${productId}`,
        ),
      ).toBe(false);
    });
  });

  it("refuses any key it has not heard of", () => {
    expect(isReportableQuery("?token=abc")).toBe(false);
    expect(isReportableQuery("?email=parent%40example.com")).toBe(false);
  });
});

/**
 * The server's half of the browser's page gates: a raw path and query stated
 * in a request body, accepted only where the browser itself could have
 * reported it.
 */
describe("reportableMarketingPage", () => {
  it("answers a marketing page's internal path and template", () => {
    expect(
      reportableMarketingPage("/fi/kauppa/abc-123?utm_source=meta&fbclid=x"),
    ).toEqual({ internalPath: "/shop/abc-123", template: "/shop/[id]" });
    expect(reportableMarketingPage("/")).toEqual({
      internalPath: "/",
      template: "/",
    });
  });

  it("accepts a redirect back to a marketing page, as the browser does", () => {
    expect(
      reportableMarketingPage("/fi/login?redirect=/fi/kauppa/abc-123"),
    ).toEqual({ internalPath: "/login", template: "/login" });
  });

  it.each([
    ["a page off the allowlist", "/fi/parent/gamers/123"],
    ["a path matching no route", "/fi/nowhere"],
    ["an unvetted query key", "/fi/kauppa?token=secret"],
    ["a redirect to a child's page", "/fi/login?redirect=/fi/parent/gamers/1"],
    ["an absolute URL", "https://evil.test/fi/kauppa"],
    ["a protocol-relative URL", "//evil.test/fi/kauppa"],
    ["a dot segment", "/fi/../kauppa"],
    ["an encoded segment", "/fi/kauppa/a%2Fb"],
    ["an empty segment", "/fi//kauppa"],
    ["a fragment", "/fi/kauppa#top"],
    ["an empty value", ""],
  ])("refuses %s", (_label, value) => {
    expect(reportableMarketingPage(value)).toBeNull();
  });
});
