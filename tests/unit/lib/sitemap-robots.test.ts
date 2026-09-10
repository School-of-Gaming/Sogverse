import { describe, it, expect, vi } from "vitest";

// The real wrapped navigation, not the setup's link-rendering stub: what these
// two files are for is the locale-prefixed, translated URLs `getPathname`
// builds, and the stub ignores the locale. `next/navigation` comes with it —
// next-intl reads `permanentRedirect` off it while constructing the wrapped
// APIs, which the setup's partial mock does not carry.
vi.unmock("@/i18n/navigation");
vi.unmock("next/navigation");

// Both modules read the site URL once, at import time.
process.env.NEXT_PUBLIC_SITE_URL = "https://test.sogverse.local";
const BASE = "https://test.sogverse.local";

const { default: sitemap } = await import("@/app/sitemap");
const { default: robots } = await import("@/app/robots");

describe("sitemap", () => {
  it("lists every indexed locale of a route and no Klingon", () => {
    // One route's entries are the ones sharing its English alternate, which is
    // the only thing about a translated set that is the same in all of them.
    const shop = sitemap().filter(
      (entry) => entry.alternates?.languages?.en === `${BASE}/en/shop`,
    );

    expect(shop.map((entry) => entry.url)).toEqual([
      `${BASE}/en/shop`,
      `${BASE}/fi/kauppa`,
      `${BASE}/sv/butik`,
      `${BASE}/fr/boutique`,
    ]);
    expect(sitemap().some((entry) => entry.url.includes("/tlh/"))).toBe(false);
  });

  it("annotates each entry with the whole language set", () => {
    const [home] = sitemap();

    expect(home.url).toBe(`${BASE}/en`);
    expect(home.alternates?.languages).toEqual({
      en: `${BASE}/en`,
      fi: `${BASE}/fi`,
      sv: `${BASE}/sv`,
      fr: `${BASE}/fr`,
    });
  });

  it("takes translated slugs from the pathnames map rather than the route name", () => {
    // The failure this pins is a sitemap advertising `/fi/privacy` — a URL that
    // exists nowhere — because someone joined a base to a route key.
    const urls = sitemap().map((entry) => entry.url);

    expect(urls).toContain(`${BASE}/fi/tietosuoja`);
    expect(urls).toContain(`${BASE}/fr/lutte-contre-le-harcelement-et-discipline`);
    expect(urls).toContain(`${BASE}/sv/kallor`);
    expect(urls).not.toContain(`${BASE}/fi/privacy`);
  });

  it("carries index pages only — nothing noindex, nothing DB-backed", () => {
    const urls = sitemap().map((entry) => entry.url);

    expect(urls.some((url) => url.includes("/roblox"))).toBe(false);
    expect(urls.some((url) => url.includes("/docs/"))).toBe(false);
    expect(urls.some((url) => url.includes("/schools"))).toBe(false);
  });
});

/** The disallow list, whatever shape the metadata type allows it to take. */
function disallowList(): string[] {
  const { rules } = robots();
  const disallow = Array.isArray(rules) ? undefined : rules.disallow;
  if (disallow === undefined) return [];
  return typeof disallow === "string" ? [disallow] : disallow;
}

describe("robots", () => {
  it("disallows every locale-prefixed variant of each gated prefix", () => {
    const disallow = disallowList();

    for (const prefix of ["/admin", "/parent", "/gamer", "/gedu", "/settings"]) {
      expect(disallow).toContain(prefix);
      // Klingon included: it is excluded from the sitemap and from hreflang,
      // but `/tlh/admin` is as much a dashboard URL as any other.
      for (const locale of ["en", "fi", "sv", "fr", "tlh"]) {
        expect(disallow).toContain(`/${locale}${prefix}`);
      }
    }
  });

  it("points at the sitemap", () => {
    expect(robots().sitemap).toBe(`${BASE}/sitemap.xml`);
  });
});
