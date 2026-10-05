import { describe, expect, it } from "vitest";
import {
  buttonTargetHref,
  canonicalizeButtonTarget,
} from "@/lib/links/button-target";
import type { SlugResolver } from "@/lib/links/own-site";

const SITE = "https://sogverse.sog.gg";
const ID = "3f1c2a9e-8b7d-4c6e-9a5f-1e2d3c4b5a69";
const resolver: SlugResolver = async (_template, locale, slug) =>
  locale === "fi" && slug === "opas" ? ID : null;

describe("canonicalizeButtonTarget", () => {
  it.each([
    ["a pasted Finnish address", "/fi/kauppa/123", "/shop/123"],
    ["a pasted absolute own-site address", `${SITE}/sv/butik/123?x=1`, "/shop/123?x=1"],
    ["a slug address, at its id", `${SITE}/fi/kirjasto/opas`, `/library/${ID}`],
    ["the root", `${SITE}/fi`, "/"],
  ])("makes %s internal", async (_name, input, path) => {
    await expect(canonicalizeButtonTarget(input, resolver, SITE)).resolves.toEqual({
      ok: true,
      target: { kind: "internal", path },
    });
  });

  it("canonicalises a stored target again", async () => {
    await expect(
      canonicalizeButtonTarget({ kind: "internal", path: "/fi/kauppa" }, resolver, SITE),
    ).resolves.toEqual({ ok: true, target: { kind: "internal", path: "/shop" } });
    await expect(
      canonicalizeButtonTarget({ kind: "external", url: `${SITE}/fi/kauppa` }, resolver, SITE),
    ).resolves.toEqual({ ok: true, target: { kind: "internal", path: "/shop" } });
  });

  it.each([
    ["another site", "https://example.com/x"],
    ["a www variant of our host", "https://www.sogverse.sog.gg/fi/kauppa"],
  ])("keeps %s external, as written", async (_name, url) => {
    await expect(canonicalizeButtonTarget(`  ${url} `, resolver, SITE)).resolves.toEqual({
      ok: true,
      target: { kind: "external", url },
    });
  });

  it.each([
    ["a path no route matches", "/fi/ei-mitaan", "dead"],
    ["a slug nobody holds", "/fi/kirjasto/tuntematon", "dead"],
    ["a scheme-less domain, read as a path", "www.example.com", "dead"],
    ["a same-page fragment", "#faq", "same-page"],
    ["a mailto: address", "mailto:hi@sog.gg", "not-web"],
    ["an empty value", "", "unusable"],
    ["a script", "javascript:alert(1)", "unusable"],
  ])("refuses %s", async (_name, input, reason) => {
    await expect(canonicalizeButtonTarget(input, resolver, SITE)).resolves.toEqual({
      ok: false,
      reason,
    });
  });
});

describe("buttonTargetHref", () => {
  it("shows an internal target in the page's language", () => {
    expect(buttonTargetHref({ kind: "internal", path: "/shop/123" }, "fi", SITE)).toBe(
      "/fi/kauppa/123",
    );
  });

  it("shows an external target as written", () => {
    expect(
      buttonTargetHref({ kind: "external", url: "https://example.com" }, "fi", SITE),
    ).toBe("https://example.com");
  });
});
