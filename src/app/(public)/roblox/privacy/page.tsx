import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDateOnly } from "@/lib/utils";
import { PolicyPage } from "@/components/legal/policy-page";
import { rawPolicyBlocks } from "@/components/legal/policy-content";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("robloxPrivacy"),
    // Same posture as /roblox, whose policy this is: shared by URL rather than
    // published while the Programme copy is still being signed off. The tag is
    // what actually keeps it out of search results; the route is deliberately
    // absent from sitemap.ts and linked only from /roblox itself.
    //
    // Deliberately NOT disallowed in robots.txt — a disallowed URL is never
    // fetched, so the crawler never reads this tag and the bare URL can still be
    // indexed off an external link. Allowing the crawl and serving noindex is
    // what deindexes. Flip this together with /roblox, never on its own.
    robots: { index: false, follow: false },
  };
}

// The date the policy *text* last changed — bump it whenever the copy below
// (in messages/*.json) is edited. A date-only value, rendered through the
// locale-aware, UTC-pinned `formatDateOnly` helper rather than hardcoded per
// language (a plain calendar date carries no zone).
const LAST_UPDATED = "2026-08-03";

// Section order *and* hierarchy are owned here, not in the message files, so
// the same structure renders for every locale. Each key maps to a flat
// `robloxPrivacy.sections.<key>` entry with a `heading` and a `blocks` array
// (ordered paragraphs and bulleted lists — see `policy-content.ts`); the
// `subsections` list names the entries rendered as second-level headings
// beneath their parent.
const SECTIONS = [
  { key: "applies", subsections: [] },
  {
    key: "responsible",
    subsections: ["responsibleLynx", "responsibleSog", "responsibleRoblox"],
  },
  {
    key: "collect",
    subsections: ["collectParent", "collectChild", "collectTechnical"],
  },
  {
    key: "use",
    subsections: [
      "useDeliver",
      "useSafety",
      "useEvaluate",
      "useEmail",
      "useMedia",
    ],
  },
  { key: "research", subsections: [] },
  { key: "marketing", subsections: [] },
  {
    key: "media",
    subsections: [
      "mediaSponsor",
      "mediaPublic",
      "mediaChildAgrees",
      "mediaCaseStudies",
      "mediaChanging",
    ],
  },
  { key: "childSafety", subsections: [] },
  { key: "helpers", subsections: [] },
  { key: "transfers", subsections: [] },
  { key: "retention", subsections: [] },
  { key: "rights", subsections: [] },
  { key: "security", subsections: [] },
  { key: "changes", subsections: [] },
  { key: "contact", subsections: [] },
] as const;

export default async function RobloxPrivacyPage() {
  const t = await getTranslations("robloxPrivacy");
  const locale = await getLocale();

  return (
    <PolicyPage
      title={t("title")}
      subtitle={t("subtitle")}
      lastUpdated={t("lastUpdated", {
        date: formatDateOnly(LAST_UPDATED, locale, { dateStyle: "long" }),
      })}
      intro={{
        heading: t("intro.heading"),
        blocks: rawPolicyBlocks(t.raw("intro.blocks")),
      }}
      sections={SECTIONS.map(({ key, subsections }) => ({
        heading: t(`sections.${key}.heading`),
        blocks: rawPolicyBlocks(t.raw(`sections.${key}.blocks`)),
        subsections: subsections.map((subsection) => ({
          heading: t(`sections.${subsection}.heading`),
          blocks: rawPolicyBlocks(t.raw(`sections.${subsection}.blocks`)),
        })),
      }))}
    />
  );
}
