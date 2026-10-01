import { describe, expect, it, vi } from "vitest";
import {
  publicAdminProfile,
  publicGeduProfile,
} from "../../../mocks/team-profile";

// The shared setup mocks the wrapped navigation, and its `getPathname` ignores
// the locale. Canonicals and `hreflang` are *about* which locale's translated
// address they name, so this file takes the real one — and the module it is
// built on, which the setup's partial mock would starve.
vi.unmock("@/i18n/navigation");
vi.unmock("next/navigation");

// The site card's alt text reads the catalog; a stub keeps the assertions on
// the shape and says which locale was asked for.
vi.mock("next-intl/server", () => ({
  getTranslations: async (
    arg: string | { locale: string; namespace: string },
  ) => {
    const namespace = typeof arg === "string" ? arg : arg.namespace;
    const locale = typeof arg === "string" ? "en" : arg.locale;
    return (key: string) => `${locale}:${namespace}.${key}`;
  },
}));

const {
  findTeamMemberBySlug,
  teamMemberAddress,
  teamMemberSharedAddress,
  teamMemberSlug,
} = await import("@/components/team/team-address");
const {
  teamMemberAlternates,
  teamMemberCanonicalPath,
  teamMemberJsonLd,
  teamMemberLocales,
  teamMemberMetadata,
} = await import("@/components/team/public/team-member-metadata");

const SECOND_EETU_ID = "0b5e8c52-8d3f-4a54-9a27-7d8f2c6e1a90";

describe("a team member's addresses", () => {
  it("derive the slug from first name and nickname, never a surname", () => {
    expect(teamMemberSlug(publicGeduProfile())).toBe("eetu-creeperhug");
    expect(teamMemberSlug(publicAdminProfile())).toBe("laura-nightowl");
    expect(
      teamMemberSlug(publicAdminProfile({ nickname: null, firstName: "Päivi" })),
    ).toBe("paivi");
  });

  it("leave the second person deriving a slug on their id", () => {
    const first = publicGeduProfile();
    const second = publicGeduProfile({ id: SECOND_EETU_ID });
    const team = [first, second];

    expect(teamMemberAddress(team, first)).toBe("eetu-creeperhug");
    expect(teamMemberAddress(team, second)).toBe(SECOND_EETU_ID);
    expect(findTeamMemberBySlug(team, "eetu-creeperhug")?.id).toBe(first.id);
  });

  it("fall back to the id for a name that derives no slug", () => {
    const person = publicGeduProfile({ firstName: "李", nickname: null });

    expect(teamMemberAddress([person], person)).toBe(person.id);
    expect(teamMemberSharedAddress(person)).toBe(person.id);
  });
});

describe("a team member's language versions", () => {
  it("are the indexed locales they wrote, never Klingon", () => {
    expect(
      teamMemberLocales(publicGeduProfile({ locales: ["en", "fi", "tlh"] })),
    ).toEqual(["en", "fi"]);
  });

  it("canonicalise a written locale to itself", () => {
    const person = publicGeduProfile({ locales: ["en", "fi"] });

    expect(teamMemberCanonicalPath(person, "eetu-creeperhug", "fi")).toBe(
      "/fi/tiimi/eetu-creeperhug",
    );
    expect(teamMemberCanonicalPath(person, "eetu-creeperhug", "en")).toBe(
      "/en/team/eetu-creeperhug",
    );
  });

  it("canonicalise an unwritten locale to the locale whose words it shows", () => {
    // English is the fallback when written…
    const both = publicGeduProfile({ locales: ["en", "fi"] });
    expect(teamMemberCanonicalPath(both, "eetu-creeperhug", "fr")).toBe(
      "/en/team/eetu-creeperhug",
    );
    // …and the first written locale when it is not.
    const finnish = publicGeduProfile({ locales: ["fi", "sv"] });
    expect(teamMemberCanonicalPath(finnish, "eetu-creeperhug", "fr")).toBe(
      "/fi/tiimi/eetu-creeperhug",
    );
  });

  it("annotate only the written versions, with x-default where an unmatched reader lands", () => {
    const finnish = publicGeduProfile({ locales: ["fi", "sv"] });

    expect(teamMemberAlternates(finnish, "eetu-creeperhug")).toEqual({
      fi: "/fi/tiimi/eetu-creeperhug",
      sv: "/sv/team/eetu-creeperhug",
      "x-default": "/fi/tiimi/eetu-creeperhug",
    });
  });

  it("annotate nothing for a person who wrote no indexed locale", () => {
    expect(
      teamMemberAlternates(publicGeduProfile({ locales: ["tlh"] }), "x"),
    ).toEqual({});
  });
});

describe("teamMemberMetadata", () => {
  it("titles the page with the name, describes it with the intro shown, and canonicalises to the slug", async () => {
    const person = publicGeduProfile({ locales: ["en", "fi"] });
    const metadata = await teamMemberMetadata({
      person,
      address: "eetu-creeperhug",
      requestLocale: "fi",
      name: "Eetu “CreeperHug”",
    });

    expect(metadata.title).toBe("Eetu “CreeperHug”");
    expect(metadata.description).toBe("Intro in fi");
    expect(metadata.alternates?.canonical).toBe("/fi/tiimi/eetu-creeperhug");
    expect(metadata.alternates?.languages).toEqual({
      en: "/en/team/eetu-creeperhug",
      fi: "/fi/tiimi/eetu-creeperhug",
      "x-default": "/en/team/eetu-creeperhug",
    });
  });

  it("at an unwritten locale, describes and canonicalises with the fallback", async () => {
    const metadata = await teamMemberMetadata({
      person: publicGeduProfile({ locales: ["en", "fi"] }),
      address: "eetu-creeperhug",
      requestLocale: "sv",
      name: "Eetu “CreeperHug”",
    });

    expect(metadata.description).toBe("Intro in en");
    expect(metadata.alternates?.canonical).toBe("/en/team/eetu-creeperhug");
    expect(metadata.openGraph).toMatchObject({ locale: "en" });
  });

  it("is a profile card on the site-wide image, with the names the page shows", async () => {
    const gedu = await teamMemberMetadata({
      person: publicGeduProfile(),
      address: "eetu-creeperhug",
      requestLocale: "en",
      name: "Eetu “CreeperHug”",
    });
    expect(gedu.openGraph).toMatchObject({
      type: "profile",
      siteName: "School of Gaming",
      url: "/en/team/eetu-creeperhug",
      firstName: "Eetu",
      username: "CreeperHug",
    });
    // Never a surname for a Gedu.
    expect(gedu.openGraph).not.toHaveProperty("lastName");
    // The site-wide card at the page's locale, not the portrait: a 4:5 photo
    // crops badly to a link preview's wide frame.
    expect(gedu.openGraph?.images).toEqual([
      expect.objectContaining({ url: "/opengraph-images/site?locale=en" }),
    ]);
    expect(gedu.twitter).toMatchObject({ card: "summary_large_image" });

    const admin = await teamMemberMetadata({
      person: publicAdminProfile(),
      address: "laura-nightowl",
      requestLocale: "en",
      name: "Laura “Nightowl” Virtanen",
    });
    expect(admin.openGraph).toMatchObject({ lastName: "Virtanen" });
  });
});

describe("teamMemberJsonLd", () => {
  const SITE = "https://test.sogverse.local";

  it("is a ProfilePage about a Person who works for the layout's Organization", () => {
    const person = publicGeduProfile({ locales: ["en", "fi"] });
    const data = teamMemberJsonLd({
      siteUrl: SITE,
      canonicalPath: "/fi/tiimi/eetu-creeperhug",
      person,
      jobTitle: "Gedu · pelikasvattaja",
      locale: "fi",
    });

    expect(data).toEqual({
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      url: `${SITE}/fi/tiimi/eetu-creeperhug`,
      inLanguage: "fi",
      mainEntity: {
        "@type": "Person",
        name: "Eetu",
        alternateName: "CreeperHug",
        jobTitle: "Gedu · pelikasvattaja",
        description: "Intro in fi",
        image: `${SITE}${person.photo?.src}`,
        knowsLanguage: ["fi", "en"],
        worksFor: {
          "@type": "Organization",
          "@id": `${SITE}/#organization`,
          name: "School of Gaming",
        },
      },
    });
  });

  it("names an admin in full", () => {
    const data = teamMemberJsonLd({
      siteUrl: SITE,
      canonicalPath: "/en/team/laura-nightowl",
      person: publicAdminProfile(),
      jobTitle: "Chief Executive Officer",
      locale: "en",
    });

    expect(data.mainEntity.name).toBe("Laura Virtanen");
  });
});
