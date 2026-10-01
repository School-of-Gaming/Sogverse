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

// The card's alt text reads the catalog; a stub keeps the assertions on the
// shape and says which locale was asked for.
vi.mock("next-intl/server", () => ({
  getTranslations: async (
    arg: string | { locale: string; namespace: string },
  ) => {
    const namespace = typeof arg === "string" ? arg : arg.namespace;
    const locale = typeof arg === "string" ? "en" : arg.locale;
    return (key: string, values?: Record<string, string>) =>
      `${locale}:${namespace}.${key}${values === undefined ? "" : JSON.stringify(values)}`;
  },
}));

const {
  findTeamMemberBySlug,
  teamMemberAddress,
  teamMemberLinkAddress,
  teamMemberPublicAddress,
  teamMemberSlug,
} = await import("@/components/team/team-address");
const {
  teamMemberCanonicalPath,
  teamMemberJsonLd,
  teamMemberLocales,
  teamMemberMetadata,
} = await import("@/components/team/public/team-member-metadata");

const { teamCardUrl } = await import("@/lib/og/team-card");

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
  });
});

describe("the public page a staff page links to", () => {
  const live = { ready: true, approved: true };

  it("links the second person deriving a slug to their own page by id, never the first's", async () => {
    const first = publicGeduProfile();
    const second = publicGeduProfile({ id: SECOND_EETU_ID });
    const listTeam = async () => [first, second];

    const read = await teamMemberPublicAddress({ ...live, profile: second }, listTeam);
    expect(read).toBe(SECOND_EETU_ID);
    expect(teamMemberLinkAddress(second, read)).toBe(SECOND_EETU_ID);

    const firstRead = await teamMemberPublicAddress({ ...live, profile: first }, listTeam);
    expect(teamMemberLinkAddress(first, firstRead)).toBe("eetu-creeperhug");
  });

  it("reads no list for a profile that is not live", async () => {
    const listTeam = vi.fn(async () => [publicGeduProfile()]);

    for (const record of [
      { ready: true, approved: false },
      { ready: false, approved: false },
    ]) {
      expect(
        await teamMemberPublicAddress({ ...record, profile: publicGeduProfile() }, listTeam),
      ).toBeNull();
    }
    expect(listTeam).not.toHaveBeenCalled();
  });

  it("falls back to the id when no address was read or the name has changed since", () => {
    const person = publicGeduProfile();

    expect(teamMemberLinkAddress(person, null)).toBe(person.id);
    expect(
      teamMemberLinkAddress({ ...person, nickname: "Redstoner" }, "eetu-creeperhug"),
    ).toBe(person.id);
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

  it("never canonicalise to text in a locale that is not indexed", () => {
    // A Klingon-only profile read at English shows the Klingon text, whose
    // own page is noindex: the English page is its own canonical instead.
    const klingon = publicGeduProfile({ locales: ["tlh"] });
    expect(teamMemberCanonicalPath(klingon, "eetu-creeperhug", "en")).toBe(
      "/en/team/eetu-creeperhug",
    );
    expect(teamMemberCanonicalPath(klingon, "eetu-creeperhug", "fi")).toBe(
      "/fi/tiimi/eetu-creeperhug",
    );
  });
});

describe("teamMemberMetadata", () => {
  it("makes a page showing Klingon text its own canonical, with no hreflang", async () => {
    const metadata = await teamMemberMetadata({
      person: publicGeduProfile({ locales: ["tlh"] }),
      address: "eetu-creeperhug",
      requestLocale: "en",
      name: "Eetu “CreeperHug”",
    });

    expect(metadata.alternates?.canonical).toBe("/en/team/eetu-creeperhug");
    expect(metadata.alternates).not.toHaveProperty("languages");
  });

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

  it("is a profile card on the person's own image, with the names the page shows", async () => {
    const person = publicGeduProfile();
    const gedu = await teamMemberMetadata({
      person,
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
    // The person's own card at the page's locale, versioned, at the card's
    // size, with an alt naming who it shows and what they do — and the same
    // image for the twitter card, which Next would not inherit.
    const card = {
      url: teamCardUrl(person, "en"),
      alt: `en:metadata.og.team.alt${JSON.stringify({
        name: "Eetu “CreeperHug”",
        role: "en:team.profile.geduTitle",
      })}`,
      width: 1200,
      height: 630,
    };
    expect(card.url).toMatch(/^\/opengraph-images\/team\/[0-9a-f-]{36}\?locale=en&v=[0-9a-f]{16}$/);
    expect(gedu.openGraph?.images).toEqual([card]);
    expect(gedu.twitter).toMatchObject({
      card: "summary_large_image",
      images: [card],
    });

    const admin = await teamMemberMetadata({
      person: publicAdminProfile(),
      address: "laura-nightowl",
      requestLocale: "en",
      name: "Laura “Nightowl” Virtanen",
    });
    expect(admin.openGraph).toMatchObject({ lastName: "Virtanen" });
    // A leader's alt names their own title.
    expect(admin.openGraph?.images).toEqual([
      expect.objectContaining({
        alt: expect.stringContaining('"role":"Chief Executive Officer"'),
      }),
    ]);
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
