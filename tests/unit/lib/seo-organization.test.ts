import { describe, expect, it } from "vitest";
import { siteJsonLd } from "@/lib/seo/organization";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { INDEXED_LOCALES } from "@/lib/metadata/localized-page";

const SITE = "https://test.sogverse.local";

const [organization, website] = siteJsonLd({
  siteUrl: SITE,
  description: "What we run.",
})["@graph"];

describe("siteJsonLd", () => {
  it("identifies the real company behind the brand", () => {
    // These are the facts that let a search engine or an assistant tie the
    // site to a registered Finnish entity instead of guessing — which is the
    // whole reason the block is worth emitting.
    expect(organization).toMatchObject({
      "@type": "Organization",
      name: "School of Gaming",
      legalName: "School of Gaming Galactic Oy",
      url: SITE,
      email: SUPPORT_EMAIL,
      vatID: "FI31104611",
      address: { "@type": "PostalAddress", addressCountry: "FI" },
    });
  });

  it("points the logo at an absolute raster URL on our own origin", () => {
    // Relative would be resolved against whatever page embedded it, and an
    // SVG is routinely skipped by the consumers that read `logo`.
    expect(organization.logo.startsWith(`${SITE}/`)).toBe(true);
    expect(organization.logo.endsWith(".png")).toBe(true);
  });

  it("corroborates the identity with only owner-confirmed profiles", () => {
    // The property is only worth anything if every URL in it is really ours,
    // so the list is pinned to the confirmed set — and a dead page (the Oulu
    // Facebook page) must never creep back in, because a `sameAs` that 404s
    // is a corroboration that fails.
    expect(organization.sameAs).toEqual([
      "https://www.sog.gg/",
      "https://www.instagram.com/sog_suomi/",
      "https://www.facebook.com/sogversum",
      "https://www.youtube.com/@SchoolofGamingSuomi",
      "https://fi.linkedin.com/company/school-of-gaming",
      "https://www.eventbrite.com/o/school-of-gaming-galactic-oy-107212050481",
      "https://www.crunchbase.com/organization/school-of-gaming",
    ]);
    expect(organization.sameAs).not.toContain("https://www.facebook.com/sogsuomi/");
    for (const url of organization.sameAs) {
      expect(url.startsWith("https://")).toBe(true);
    }
  });

  it("declares the site in the indexed locales and no others", () => {
    // Klingon resolves and is excluded from `hreflang` and the sitemap;
    // telling a consumer the site is published in it contradicts both.
    expect(website.inLanguage).toEqual([...INDEXED_LOCALES]);
    expect(website.inLanguage).not.toContain("tlh");
  });

  it("describes the site with the description it was handed", () => {
    // The caller passes the translated one, so each language's pages describe
    // themselves in their own words rather than in English.
    expect(website.description).toBe("What we run.");
  });

  it("joins the two nodes by @id rather than repeating the company", () => {
    expect(website.publisher["@id"]).toBe(organization["@id"]);
    expect(website["@id"]).not.toBe(organization["@id"]);
  });
});
