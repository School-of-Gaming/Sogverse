import { describe, expect, it } from "vitest";
import { PATHNAMES } from "@/i18n/pathnames";
import {
  isMarketingPage,
  isReportableQuery,
  MARKETING_PAGES,
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

  it("refuses any key it has not heard of", () => {
    expect(isReportableQuery("?token=abc")).toBe(false);
    expect(isReportableQuery("?email=parent%40example.com")).toBe(false);
  });
});
