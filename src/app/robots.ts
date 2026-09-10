import type { MetadataRoute } from "next";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL!;

/**
 * The prefixes no crawler is invited into — the four role dashboards and
 * settings. They are all behind a login, so this is tidiness rather than a
 * control; the controls are the proxy's role gates and RLS.
 *
 * **Their segments are English in every locale** (dashboards are app surfaces,
 * not indexable content), so only the locale prefix varies — which is exactly
 * why the prefixed variants are derived from the locale list below instead of
 * being written out five times each. A locale added to `SUPPORTED_LOCALES`
 * would otherwise leave `/es/admin` crawlable with nothing to notice.
 *
 * Every locale, Klingon included: `tlh` is excluded from the sitemap and from
 * `hreflang`, but `/tlh/admin` is as much a dashboard URL as any other.
 */
const GATED_PREFIXES = ["/admin", "/parent", "/gamer", "/gedu", "/settings"];

/**
 * The AI crawlers — the ones that train on the web, and the ones that fetch a
 * page live to answer somebody's question — each named explicitly, each given
 * exactly the `*` rule.
 *
 * **The rules are redundant on purpose, and the redundancy is the point.**
 * `*` already admits every one of these agents, so nothing here changes what a
 * crawler is allowed to do today. What it changes is what a future edit can do
 * by accident: letting AI assistants read and cite the public site is an owner
 * decision, not an oversight, and an unstated decision is one a later
 * "let's block the scrapers" pass flips without anyone noticing it was ever
 * made. A named rule per agent is that decision written where the next person
 * to edit this file will read it.
 *
 * The list is one constant so adding an agent is one line, and so the allow /
 * disallow stays derived from the `*` rule rather than copied beside it —
 * a copy is what would let the two drift and quietly hand a crawler a
 * dashboard URL.
 *
 * Neither list is exhaustive of the web's crawlers, and it does not need to be:
 * an agent nobody has heard of yet still matches `*` and is treated the same.
 */
const AI_CRAWLER_USER_AGENTS = [
  // OpenAI: training, the live fetch a ChatGPT user triggers, and search.
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  // Anthropic: the same three roles.
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  // Perplexity: its index, and its live fetch.
  "PerplexityBot",
  "Perplexity-User",
  // Google and Apple keep their AI use behind separate opt-out tokens rather
  // than separate crawlers — these two are not fetchers at all, they are the
  // switches that say whether Googlebot's and Applebot's existing crawl may
  // feed Gemini and Apple Intelligence. Allowing them is the same decision.
  "Google-Extended",
  "Applebot-Extended",
  // Common Crawl, whose corpus most other models are trained from.
  "CCBot",
  // Meta, Amazon, ByteDance.
  "meta-externalagent",
  "Amazonbot",
  "Bytespider",
];

export default function robots(): MetadataRoute.Robots {
  const disallow = GATED_PREFIXES.flatMap((prefix) => [
    // The bare path stays listed: it is a real URL that redirects into its
    // prefixed form, and a crawler should not follow it there either.
    prefix,
    ...SUPPORTED_LOCALES.map((locale) => `/${locale}${prefix}`),
  ]);
  const permissions = { allow: "/", disallow };

  return {
    rules: [
      { userAgent: "*", ...permissions },
      ...AI_CRAWLER_USER_AGENTS.map((userAgent) => ({
        userAgent,
        ...permissions,
      })),
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
