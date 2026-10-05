import { describe, expect, it, vi } from "vitest";
import {
  canonicalizeHref,
  localizeOwnSiteHref,
  mailOwnSiteHref,
  resolveCanonicalHref,
  resolveSlugAddress,
  type SlugResolver,
} from "@/lib/links/own-site";

const SITE = "https://sogverse.sog.gg";
const ID = "3f1c2a9e-8b7d-4c6e-9a5f-1e2d3c4b5a69";

describe("canonicalizeHref", () => {
  it.each([
    ["a Finnish shop address", "/fi/kauppa/123", "/shop/123"],
    ["a Swedish absolute address, query and fragment kept", `${SITE}/sv/butik/123?x=1#y`, "/shop/123?x=1#y"],
    ["an already canonical path", "/shop/123", "/shop/123"],
    ["a bare translated path", "/kauppa/123", "/shop/123"],
    ["a French nested route", "/fr/ecoles/helsinki/42", "/schools/helsinki/42"],
    ["the root", "/", "/"],
    ["a bare locale", "/fi", "/"],
    ["a bare locale with a slash", "/fi/", "/"],
    ["a Klingon address (English slugs)", "/tlh/shop/9", "/shop/9"],
    ["an uppercase locale prefix", "/FI/kauppa/1", "/shop/1"],
    ["an uppercase host", "HTTPS://SOGVERSE.SOG.GG/fi/kauppa", "/shop"],
    ["plain http on our host", "http://sogverse.sog.gg/fi/meista", "/about"],
    ["a trailing slash", "/fi/kauppa/", "/shop"],
    ["dot segments", "/fi/kirjasto/../kauppa", "/shop"],
    ["another locale's slug under a locale", "/fi/shop/1", "/shop/1"],
    ["an English-segment app route", "/fi/parent", "/parent"],
    ["a query on a page", "/en/shop?topic=minecraft", "/shop?topic=minecraft"],
  ])("rewrites %s to its internal route", (_name, href, path) => {
    expect(canonicalizeHref(href, SITE)).toEqual({ kind: "internal", path });
  });

  it.each([
    ["a fragment", "#faq"],
    ["a query", "?x=1"],
  ])("leaves a same-page %s as written", (_name, href) => {
    expect(canonicalizeHref(href, SITE)).toEqual({ kind: "internal", path: href });
  });

  it.each([
    ["a path no route matches", "/fi/nothing-here"],
    ["a file rather than a page", "/llms.txt"],
    ["an API route", "/api/stripe/webhook"],
    ["a lowercase locale with an uppercase slug", "/fi/KAUPPA"],
    ["an absolute address on our host at no route", `${SITE}/nope`],
    ["a path one segment too deep", "/shop/1/2"],
  ])("calls %s dead", (_name, href) => {
    expect(canonicalizeHref(href, SITE)).toEqual({ kind: "dead" });
  });

  it.each([
    ["another site", "https://example.com/fi/kauppa"],
    ["a www variant of our host", "https://www.sogverse.sog.gg/fi/kauppa"],
    ["our host on another port", "https://sogverse.sog.gg:8443/shop"],
    ["a subdomain of ours", "https://evil.sogverse.sog.gg/shop"],
    ["a protocol-relative address", "//example.com/x"],
    ["a mailto: address", "mailto:hi@sog.gg"],
  ])("leaves %s untouched", (_name, href) => {
    expect(canonicalizeHref(href, SITE)).toEqual({ kind: "external", href });
  });

  it("treats every absolute address as another site's when the site is not configured", () => {
    expect(canonicalizeHref(`${SITE}/fi/kauppa`, undefined)).toEqual({
      kind: "external",
      href: `${SITE}/fi/kauppa`,
    });
    expect(canonicalizeHref("/fi/kauppa", undefined)).toEqual({
      kind: "internal",
      path: "/shop",
    });
  });

  it.each([
    ["an empty href", ""],
    ["whitespace", "   "],
    ["a script", "javascript:alert(1)"],
    ["data", "data:text/html,hi"],
  ])("calls %s unusable", (_name, href) => {
    expect(canonicalizeHref(href, SITE)).toEqual({ kind: "unusable" });
  });

  it("stores an id address as it is, in any locale", () => {
    expect(canonicalizeHref(`/fi/kirjasto/${ID}`, SITE)).toEqual({
      kind: "internal",
      path: `/library/${ID}`,
    });
    expect(canonicalizeHref(`/sv/team/${ID}?a=1`, SITE)).toEqual({
      kind: "internal",
      path: `/team/${ID}?a=1`,
    });
  });

  it("hands a slug address over for resolution, in the URL's locale", () => {
    expect(canonicalizeHref(`${SITE}/fi/kirjasto/minecraft-opas#alku`, SITE)).toEqual({
      kind: "slug",
      address: {
        template: "/library/[idOrSlug]",
        locale: "fi",
        slug: "minecraft-opas",
        pathname: "/library/minecraft-opas",
        suffix: "#alku",
      },
    });
  });

  it("reads a bare slug address in the language its segments are spelled in", () => {
    const finnish = canonicalizeHref("/kirjasto/opas", SITE);
    const english = canonicalizeHref("/library/guide", SITE);
    const french = canonicalizeHref("/equipe/aino", SITE);
    expect(finnish.kind === "slug" && finnish.address.locale).toBe("fi");
    expect(english.kind === "slug" && english.address.locale).toBe("en");
    expect(french.kind === "slug" && french.address.locale).toBe("fr");
  });

  it("keeps Klingon as a slug's language", () => {
    const result = canonicalizeHref("/tlh/team/qapla", SITE);
    expect(result.kind === "slug" && result.address).toMatchObject({
      template: "/team/[idOrSlug]",
      locale: "tlh",
      slug: "qapla",
    });
  });
});

describe("resolveSlugAddress", () => {
  it("rewrites a slug address to the id the resolver finds, keeping query and fragment", async () => {
    const resolver = vi.fn<SlugResolver>().mockResolvedValue(ID);
    await expect(
      resolveCanonicalHref("/fi/kirjasto/minecraft-opas?x=1#alku", resolver, SITE),
    ).resolves.toEqual({ kind: "internal", path: `/library/${ID}?x=1#alku` });
    expect(resolver).toHaveBeenCalledWith("/library/[idOrSlug]", "fi", "minecraft-opas");
  });

  it("calls a slug the resolver cannot find dead", async () => {
    await expect(
      resolveCanonicalHref("/team/nobody", async () => null, SITE),
    ).resolves.toEqual({ kind: "dead" });
  });

  it("never asks the resolver about anything but a slug", async () => {
    const resolver = vi.fn<SlugResolver>();
    for (const href of [`/library/${ID}`, "/shop/1", "https://example.com", "/nope", "#x"]) {
      await resolveSlugAddress(canonicalizeHref(href, SITE), resolver);
    }
    expect(resolver).not.toHaveBeenCalled();
  });
});

describe("localizeOwnSiteHref", () => {
  it.each([
    ["a canonical path", "/shop/123", "fi", "/fi/kauppa/123"],
    ["a canonical path, in English", "/shop/123", "en", "/en/shop/123"],
    ["a locale-pinned path from another language", "/sv/butik/123", "fi", "/fi/kauppa/123"],
    ["an absolute own-site address", `${SITE}/sv/butik/123?x=1#y`, "fr", "/fr/boutique/123?x=1#y"],
    ["the root", "/", "sv", "/sv"],
    ["a bare locale", "/en", "fi", "/fi"],
    ["a Klingon page", "/fi/kauppa", "tlh", "/tlh/shop"],
    ["an id address", `/library/${ID}`, "fi", `/fi/kirjasto/${ID}`],
  ] as const)("localises %s", (_name, href, locale, expected) => {
    expect(localizeOwnSiteHref(href, locale, SITE)).toBe(expected);
  });

  it("keeps a slug address in its own language, the only one it resolves in", () => {
    expect(localizeOwnSiteHref("/fi/kirjasto/opas", "en", SITE)).toBe("/fi/kirjasto/opas");
    expect(localizeOwnSiteHref("/library/guide", "fi", SITE)).toBe("/en/library/guide");
  });

  it.each([
    ["another site", "https://example.com/shop"],
    ["a www variant of our host", "https://www.sogverse.sog.gg/shop"],
    ["a mailto: address", "mailto:hi@sog.gg"],
    ["a fragment", "#faq"],
    ["a path no route matches", "/llms.txt"],
  ])("leaves %s as written", (_name, href) => {
    expect(localizeOwnSiteHref(href, "fi", SITE)).toBe(href);
  });
});

describe("mailOwnSiteHref", () => {
  it.each([
    ["a canonical path", "/shop/123", `${SITE}/shop/123`],
    ["a locale-pinned path", "/fi/kauppa/123?x=1", `${SITE}/shop/123?x=1`],
    ["an absolute own-site address", `${SITE}/sv/butik`, `${SITE}/shop`],
    ["a bare locale", "/fi", `${SITE}/`],
    ["an id address", `/fi/kirjasto/${ID}`, `${SITE}/library/${ID}`],
    ["a slug address, in its own language", "/fi/kirjasto/opas", `${SITE}/fi/kirjasto/opas`],
    ["a path no route matches", "/llms.txt", `${SITE}/llms.txt`],
  ])("writes %s absolute and bare", (_name, href, expected) => {
    expect(mailOwnSiteHref(href, SITE)).toBe(expected);
  });

  it.each([
    ["another site", "https://example.com/x"],
    ["a mailto: address", "mailto:hi@sog.gg"],
    ["a fragment", "#faq"],
  ])("leaves %s as written", (_name, href) => {
    expect(mailOwnSiteHref(href, SITE)).toBe(href);
  });

  it("leaves everything as written with no origin to write", () => {
    expect(mailOwnSiteHref("/fi/kauppa", undefined)).toBe("/fi/kauppa");
    expect(mailOwnSiteHref("/fi/kauppa", "not a url")).toBe("/fi/kauppa");
  });
});
