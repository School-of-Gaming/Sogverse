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

  it("claims no lastModified at all", () => {
    // It used to be `new Date()`, evaluated per request, so every URL said it
    // had changed on this crawl and on every previous one. A lastmod that is
    // always today is a lastmod a search engine stops reading; no field at all
    // sends it to its own change detection, which is where it was going anyway.
    expect(sitemap().every((entry) => entry.lastModified === undefined)).toBe(true);
  });

  it("carries index pages only — nothing noindex, nothing DB-backed", () => {
    const urls = sitemap().map((entry) => entry.url);

    expect(urls.some((url) => url.includes("/roblox"))).toBe(false);
    expect(urls.some((url) => url.includes("/docs/"))).toBe(false);
    expect(urls.some((url) => url.includes("/schools"))).toBe(false);
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
