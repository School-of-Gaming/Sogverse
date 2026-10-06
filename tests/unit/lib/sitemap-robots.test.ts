import { afterAll, describe, it, expect, vi } from "vitest";

// The real wrapped navigation, not the setup's link-rendering stub: what these
// two files are for is the locale-prefixed, translated URLs `getPathname`
// builds, and the stub ignores the locale. `next/navigation` comes with it —
// next-intl reads `permanentRedirect` off it while constructing the wrapped
// APIs, which the setup's partial mock does not carry.
vi.unmock("@/i18n/navigation");
vi.unmock("next/navigation");

// Both modules read the site URL once, at import time.
process.env.NEXT_PUBLIC_SITE_URL = "https://test.sogverse.local";
// The sitemap builds its anonymous client from these; the read itself is mocked.
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
afterAll(() => vi.unstubAllEnvs());
const BASE = "https://test.sogverse.local";

// The public team the sitemap reads. Two people deriving one slug, so the
// second is listed at their id; one who wrote Finnish and English, one who
// wrote French and Klingon.
const { publicAdminProfile, publicGeduProfile } = await import(
  "../../mocks/team-profile"
);
const SECOND_EETU_ID = "0b5e8c52-8d3f-4a54-9a27-7d8f2c6e1a90";
const mockListPublicTeamProfiles = vi.fn();
vi.mock("@/services/team-profiles/team-profiles.service", () => ({
  TeamProfilesService: class {
    listPublicTeamProfiles = mockListPublicTeamProfiles;
  },
}));
mockListPublicTeamProfiles.mockResolvedValue([
  publicAdminProfile({ locales: ["fr", "tlh"] }),
  publicGeduProfile({ locales: ["en", "fi"] }),
  // Saved after the first Eetu, so the slug is the first's.
  publicGeduProfile({
    id: SECOND_EETU_ID,
    locales: ["en"],
    createdAt: "2026-09-30T00:00:00+00:00",
  }),
]);

// The live Library the sitemap reads: one article in English and Finnish, one
// in Finnish alone, and a newer one whose English title takes the first's
// slug, so it is listed at its id.
const FINNISH_ONLY_ID = "70f64c69-1681-4b3b-8ab6-420642e48598";
const NEWER_ID = "5e0c7a3b-2f14-4e8d-9b6a-1d3c8f7e2a90";
const mockListPublishedArticles = vi.fn();
vi.mock("@/services/library/library.service", () => ({
  LibraryService: class {
    listPublishedArticles = mockListPublishedArticles;
  },
}));
function liveArticle(
  id: string,
  firstPublishedAt: string,
  versions: { locale: string; title: string }[],
) {
  return {
    id,
    category: "learning",
    coverPath: null,
    firstPublishedAt,
    publishedAt: "2026-09-15T08:00:00.000Z",
    versions: versions.map((version) => ({ ...version, summary: "In short." })),
  };
}
mockListPublishedArticles.mockResolvedValue([
  liveArticle(NEWER_ID, "2026-08-01T08:00:00Z", [
    { locale: "en", title: "What children learn in a club!" },
  ]),
  liveArticle(FINNISH_ONLY_ID, "2026-06-01T08:00:00Z", [
    { locale: "fi", title: "Pelikerho koulupäivän jälkeen" },
  ]),
  liveArticle("482f0c6f-0fbc-4202-8790-a73a4520fb47", "2026-05-01T08:00:00Z", [
    { locale: "en", title: "What children learn in a club" },
    { locale: "fi", title: "Mitä lapset oppivat kerhossa" },
    { locale: "tlh", title: "Qapla" },
  ]),
]);

// The live landing pages the sitemap reads: one live in English and Finnish
// (and Klingon, which is never listed), one in Swedish alone.
const LANDING_ID = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d";
const SWEDISH_LANDING_ID = "1f2e3d4c-5b6a-4978-8695-a4b3c2d1e0f9";
const mockListPublishedLandingPages = vi.fn();
vi.mock("@/services/landing-pages/landing-pages.service", () => ({
  LandingPageService: class {
    listPublishedPages = mockListPublishedLandingPages;
  },
}));
mockListPublishedLandingPages.mockResolvedValue([
  {
    id: LANDING_ID,
    firstPublishedAt: "2026-09-01T08:00:00.000Z",
    publishedAt: "2026-10-02T08:00:00.000Z",
    versions: [
      { locale: "en", title: "Clubs in Espoo", summary: "Espoo.", slug: "clubs-in-espoo" },
      { locale: "fi", title: "Kerhot Espoossa", summary: "Espoo.", slug: "kerhot-espoossa" },
      { locale: "tlh", title: "Qapla", summary: "Qapla.", slug: "qapla-espoo" },
    ],
  },
  {
    id: SWEDISH_LANDING_ID,
    firstPublishedAt: "2026-09-02T08:00:00.000Z",
    publishedAt: "2026-09-03T08:00:00.000Z",
    versions: [
      { locale: "sv", title: "Klubbar i Esbo", summary: "Esbo.", slug: "klubbar-i-esbo" },
    ],
  },
]);

// The shop's listing the sitemap reads — the grid's own query, so it holds
// only listed, unended shop products: one written in English and Finnish, one
// in Swedish and Klingon. An unlisted, ended or municipality product is never
// on it, which is the whole of how those stay out.
const LISTED_ID = "3f8a2c1e-6b4d-4e9a-8c7f-2d1e0b9a8c76";
const SWEDISH_ID = "7d6c5b4a-3e2f-4a1b-9c8d-7e6f5a4b3c2d";
const mockListVisibleListingByTypes = vi.fn();
vi.mock("@/services/products/products.service", () => ({
  ProductsService: class {
    listVisibleListingByTypes = mockListVisibleListingByTypes;
  },
}));
function listedProduct(id: string, locales: string[]) {
  return {
    id,
    start_date: "2026-09-01",
    end_date: null,
    timezone: "Europe/Helsinki",
    product_translations: locales.map((locale) => ({ locale })),
  };
}
mockListVisibleListingByTypes.mockResolvedValue([
  listedProduct(LISTED_ID, ["fi", "en"]),
  listedProduct(SWEDISH_ID, ["sv", "tlh"]),
]);

const { default: sitemap } = await import("@/app/sitemap");
const { default: robots } = await import("@/app/robots");

const entries = await sitemap();

describe("sitemap", () => {
  it("lists every indexed locale of a route and no Klingon", () => {
    // One route's entries are the ones sharing its English alternate, which is
    // the only thing about a translated set that is the same in all of them.
    const shop = entries.filter(
      (entry) => entry.alternates?.languages?.en === `${BASE}/en/shop`,
    );

    expect(shop.map((entry) => entry.url)).toEqual([
      `${BASE}/en/shop`,
      `${BASE}/fi/kauppa`,
      `${BASE}/sv/butik`,
      `${BASE}/fr/boutique`,
    ]);
    expect(entries.some((entry) => entry.url.includes("/tlh/"))).toBe(false);
  });

  it("annotates each entry with the whole language set", () => {
    const [home] = entries;

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
    const urls = entries.map((entry) => entry.url);

    expect(urls).toContain(`${BASE}/fi/tietosuoja`);
    expect(urls).toContain(`${BASE}/fr/lutte-contre-le-harcelement-et-discipline`);
    expect(urls).toContain(`${BASE}/sv/kallor`);
    expect(urls).not.toContain(`${BASE}/fi/privacy`);
  });

  it("claims a lastModified only for a Library article or a landing page", () => {
    // It used to be `new Date()`, evaluated per request, so every URL said it
    // had changed on this crawl and on every previous one. A lastmod that is
    // always today is a lastmod a search engine stops reading; no field at all
    // sends it to its own change detection, which is where it was going anyway.
    // An article's and a landing page's publish times are real, and are the
    // only dates given.
    const dated = entries.filter((entry) => entry.lastModified !== undefined);
    expect(dated.length).toBeGreaterThan(0);
    expect(
      dated.every((entry) =>
        /\/(library|kirjasto|discover|tutustu|upptack)\/./.test(entry.url),
      ),
    ).toBe(true);
    expect(dated[0].lastModified).toBe("2026-09-15T08:00:00.000Z");
  });

  it("lists each live landing page at its slug address, in the indexed locales it is live in, dated by its publish", () => {
    const espoo = entries.filter((entry) => entry.url.includes("espo"));
    expect(espoo.map((entry) => entry.url)).toEqual([
      `${BASE}/en/discover/clubs-in-espoo`,
      `${BASE}/fi/tutustu/kerhot-espoossa`,
    ]);
    expect(espoo[0].alternates?.languages).toEqual({
      en: `${BASE}/en/discover/clubs-in-espoo`,
      fi: `${BASE}/fi/tutustu/kerhot-espoossa`,
    });
    expect(espoo[0].lastModified).toBe("2026-10-02T08:00:00.000Z");
    expect(
      entries.filter((entry) => entry.url.includes("esbo")).map((entry) => entry.url),
    ).toEqual([`${BASE}/sv/upptack/klubbar-i-esbo`]);
  });

  it("still lists the static routes when the landing pages cannot be read", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    mockListPublishedLandingPages.mockRejectedValueOnce(new Error("down"));

    const urls = (await sitemap()).map((entry) => entry.url);
    quiet.mockRestore();

    expect(urls).toContain(`${BASE}/en/library`);
    expect(urls.some((url) => url.includes("espoo"))).toBe(false);
  });

  it("carries nothing noindex", () => {
    const urls = entries.map((entry) => entry.url);

    expect(urls.some((url) => url.includes("/roblox"))).toBe(false);
    expect(urls.some((url) => url.includes("/docs/"))).toBe(false);
    expect(urls.some((url) => url.includes("/schools"))).toBe(false);
    expect(urls.some((url) => url.includes("/preview"))).toBe(false);
  });

  it("lists the Library index in every indexed locale", () => {
    const urls = entries.map((entry) => entry.url);

    expect(urls).toEqual(
      expect.arrayContaining([
        `${BASE}/en/library`,
        `${BASE}/fi/kirjasto`,
        `${BASE}/sv/bibliotek`,
        `${BASE}/fr/bibliotheque`,
      ]),
    );
  });

  it("lists each article at its slug address, in the indexed locales it was written in", () => {
    const article = entries.filter(
      (entry) =>
        entry.url.endsWith("/what-children-learn-in-a-club") ||
        entry.url.endsWith("/mita-lapset-oppivat-kerhossa"),
    );
    expect(article.map((entry) => entry.url)).toEqual([
      `${BASE}/en/library/what-children-learn-in-a-club`,
      `${BASE}/fi/kirjasto/mita-lapset-oppivat-kerhossa`,
    ]);
    expect(article[0].alternates?.languages).toEqual({
      en: `${BASE}/en/library/what-children-learn-in-a-club`,
      fi: `${BASE}/fi/kirjasto/mita-lapset-oppivat-kerhossa`,
    });

    // Written in Finnish alone: listed in Finnish alone.
    expect(
      entries
        .filter((entry) => entry.url.endsWith("/pelikerho-koulupaivan-jalkeen"))
        .map((entry) => entry.url),
    ).toEqual([`${BASE}/fi/kirjasto/pelikerho-koulupaivan-jalkeen`]);
  });

  it("lists the newer of two articles deriving one slug at its id", () => {
    const urls = entries.map((entry) => entry.url);

    expect(urls).toContain(`${BASE}/en/library/${NEWER_ID}`);
    expect(
      urls.filter((url) => url === `${BASE}/en/library/what-children-learn-in-a-club`),
    ).toHaveLength(1);
  });

  it("still lists the static routes when the Library cannot be read", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    mockListPublishedArticles.mockRejectedValueOnce(new Error("down"));

    const urls = (await sitemap()).map((entry) => entry.url);
    quiet.mockRestore();

    expect(urls).toContain(`${BASE}/en/library`);
    expect(urls.some((url) => url.includes("kerhossa"))).toBe(false);
  });

  it("reads the shop's own listing", () => {
    expect(mockListVisibleListingByTypes).toHaveBeenCalledWith([
      "consumer_club",
      "camp",
      "event",
    ]);
  });

  it("lists each listed product at its shop address, in the indexed locales it was written in", () => {
    const product = entries.filter((entry) => entry.url.endsWith(`/${LISTED_ID}`));
    expect(product.map((entry) => entry.url)).toEqual([
      `${BASE}/en/shop/${LISTED_ID}`,
      `${BASE}/fi/kauppa/${LISTED_ID}`,
    ]);
    expect(product[0].alternates?.languages).toEqual({
      en: `${BASE}/en/shop/${LISTED_ID}`,
      fi: `${BASE}/fi/kauppa/${LISTED_ID}`,
    });
    expect(product[0].lastModified).toBeUndefined();

    // Written in Swedish and Klingon: Swedish only.
    expect(
      entries
        .filter((entry) => entry.url.endsWith(`/${SWEDISH_ID}`))
        .map((entry) => entry.url),
    ).toEqual([`${BASE}/sv/butik/${SWEDISH_ID}`]);
  });

  it("still lists the static routes when the shop's listing cannot be read", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    mockListVisibleListingByTypes.mockRejectedValueOnce(new Error("down"));

    const urls = (await sitemap()).map((entry) => entry.url);
    quiet.mockRestore();

    expect(urls).toContain(`${BASE}/en/shop`);
    expect(urls.some((url) => url.includes(LISTED_ID))).toBe(false);
  });

  it("lists the Team index in every indexed locale", () => {
    const urls = entries.map((entry) => entry.url);

    expect(urls).toEqual(
      expect.arrayContaining([
        `${BASE}/en/team`,
        `${BASE}/fi/tiimi`,
        `${BASE}/sv/team`,
        `${BASE}/fr/equipe`,
      ]),
    );
  });

  it("lists each profile at its canonical address, in the indexed locales they wrote", () => {
    const eetu = entries.filter((entry) => entry.url.endsWith("/eetu-creeperhug"));
    expect(eetu.map((entry) => entry.url)).toEqual([
      `${BASE}/en/team/eetu-creeperhug`,
      `${BASE}/fi/tiimi/eetu-creeperhug`,
    ]);
    expect(eetu[0].alternates?.languages).toEqual({
      en: `${BASE}/en/team/eetu-creeperhug`,
      fi: `${BASE}/fi/tiimi/eetu-creeperhug`,
    });

    // Written in French and Klingon: French only, Klingon is never indexed.
    const laura = entries.filter((entry) => entry.url.endsWith("/laura-nightowl"));
    expect(laura.map((entry) => entry.url)).toEqual([
      `${BASE}/fr/equipe/laura-nightowl`,
    ]);
  });

  it("lists the newer of two people deriving a slug at their id, not at the slug", () => {
    const urls = entries.map((entry) => entry.url);

    expect(urls).toContain(`${BASE}/en/team/${SECOND_EETU_ID}`);
    expect(
      urls.filter((url) => url === `${BASE}/en/team/eetu-creeperhug`),
    ).toHaveLength(1);
  });

  it("still lists the static routes when the team cannot be read", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    mockListPublicTeamProfiles.mockRejectedValueOnce(new Error("down"));

    const urls = (await sitemap()).map((entry) => entry.url);
    quiet.mockRestore();

    expect(urls).toContain(`${BASE}/en/team`);
    expect(urls.some((url) => url.includes("creeperhug"))).toBe(false);
  });
});

// `rules` is typed as "one rule or many", so a single rule and an array of
// them are the same type as far as the metadata contract is concerned. The
// generic is what makes the conditional distribute over that union — written
// against the alias directly it would resolve to the union itself, array
// included, and every field access below would fail.
type Unwrap<T> = T extends readonly (infer Element)[] ? Element : T;
type Rule = Unwrap<ReturnType<typeof robots>["rules"]>;

/** Every rule the file emits, whatever shape the metadata type allows. */
function rules(): Rule[] {
  const { rules: emitted } = robots();
  return Array.isArray(emitted) ? emitted : [emitted];
}

/** One rule's user agents, normalised to a list. */
function agentsOf(rule: Rule): string[] {
  const agent = rule.userAgent;
  if (agent === undefined) return [];
  return typeof agent === "string" ? [agent] : agent;
}

/** One rule's disallow list, normalised the same way. */
function disallowOf(rule: Rule): string[] {
  const disallow = rule.disallow;
  if (disallow === undefined) return [];
  return typeof disallow === "string" ? [disallow] : disallow;
}

/** The wildcard rule — the one every other rule has to agree with. */
function wildcardRule(): Rule {
  const rule = rules().find((candidate) => agentsOf(candidate).includes("*"));
  if (rule === undefined) throw new Error("robots.txt emitted no `*` rule");
  return rule;
}

/** The disallow list of the `*` rule. */
function disallowList(): string[] {
  return disallowOf(wildcardRule());
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

  it("still emits a `*` rule", () => {
    // The catch-all is what covers an agent nobody has heard of yet, and the
    // named rules below are additions to it, never a replacement.
    expect(agentsOf(wildcardRule())).toContain("*");
  });

  it("names every AI crawler explicitly", () => {
    // The named rules change nothing a crawler may do — `*` already admits all
    // of them — and that is exactly what is being pinned. Letting AI
    // assistants read and cite the public site is an owner decision, and a
    // decision that exists only as the *absence* of a block is one a later
    // "let's block the scrapers" pass flips without knowing it was ever made.
    const named = rules().flatMap(agentsOf);

    for (const agent of [
      "GPTBot",
      "ChatGPT-User",
      "OAI-SearchBot",
      "ClaudeBot",
      "Claude-User",
      "Claude-SearchBot",
      "anthropic-ai",
      "PerplexityBot",
      "Perplexity-User",
      "Google-Extended",
      "Applebot-Extended",
      "CCBot",
      "meta-externalagent",
      "Amazonbot",
      "Bytespider",
    ]) {
      expect(named).toContain(agent);
    }
  });

  it("gives every named agent exactly the wildcard's permissions", () => {
    // Naming an agent is for stating the stance, never for varying it: a named
    // rule that drifted from `*` would be a second, quieter policy — and the
    // one that matters, since a named rule wins over the wildcard for that
    // agent. A dashboard prefix missing from one of them is the concrete harm.
    const wildcard = wildcardRule();

    for (const rule of rules()) {
      expect(rule.allow).toEqual(wildcard.allow);
      expect(disallowOf(rule)).toEqual(disallowOf(wildcard));
    }
  });
});
