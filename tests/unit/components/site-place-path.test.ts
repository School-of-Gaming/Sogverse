import { describe, it, expect } from "vitest";
import { sitePlacePath } from "@/components/admin/sites/site-place-path";

// Both reads behind the admin sites surfaces return a site's chain NEAREST
// first — `ancestors[0]` is the level immediately above the site, whatever the
// country — and a breadcrumb reads the other way. Getting the direction wrong
// is silent: the line still renders, it just claims Finland sits inside
// Helsinki.

describe("sitePlacePath", () => {
  const helsinki = [
    { name: "Helsinki", name_i18n: { sv: "Helsingfors" } },
    { name: "Uusimaa", name_i18n: { sv: "Nyland" } },
    { name: "Suomi", name_i18n: { sv: "Finland", en: "Finland" } },
  ];

  it("reads root-first, reversing the nearest-first chain", () => {
    expect(sitePlacePath(helsinki, "fi")).toBe("Suomi › Uusimaa › Helsinki");
  });

  it("resolves every level through the viewer's locale", () => {
    expect(sitePlacePath(helsinki, "sv")).toBe(
      "Finland › Nyland › Helsingfors",
    );
  });

  // A row with no alternate for this locale falls back to its canonical name,
  // which is every admin-created site and most municipalities.
  it("falls back to the canonical name where a locale has no override", () => {
    expect(
      sitePlacePath(
        [
          { name: "Lille", name_i18n: null },
          { name: "Nord", name_i18n: null },
          { name: "Hauts-de-France", name_i18n: null },
          { name: "France", name_i18n: { fi: "Ranska" } },
        ],
        "fi",
      ),
    ).toBe("Ranska › Hauts-de-France › Nord › Lille");
  });

  // Countries sit at depth 0, so a site parked directly under one has a chain
  // of exactly one link — the shape that would break a hardcoded depth.
  it("renders a one-link chain without a separator", () => {
    expect(sitePlacePath([{ name: "Suomi", name_i18n: null }], "en")).toBe(
      "Suomi",
    );
  });

  // Nothing is ever parented above a country, so this is defensive rather than
  // reachable — but an empty line is the right answer, not a stray separator.
  it("renders nothing for an empty chain", () => {
    expect(sitePlacePath([], "en")).toBe("");
  });

  // The caller puts the site itself in a heading or a link beside this line;
  // repeating it here would read as another level of the tree.
  it("never includes the site's own name — it is only given ancestors", () => {
    expect(sitePlacePath(helsinki, "fi")).not.toContain("Kallion koulu");
  });
});
