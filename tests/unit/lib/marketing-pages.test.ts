import { describe, expect, it } from "vitest";
import { PATHNAMES } from "@/i18n/pathnames";
import { isMarketingPage, MARKETING_PAGES } from "@/lib/marketing-pages";

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
