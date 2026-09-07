import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDateOnly } from "@/lib/utils";
import { rawString } from "@/lib/i18n/raw-messages";
import { PolicyPage } from "@/components/legal/policy-page";
import { rawPolicyBlocks } from "@/components/legal/policy-content";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("robloxTerms"),
    // Same posture as /roblox, whose terms these are: shared by URL rather than
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

// The date the terms *text* last changed — bump it whenever the copy below (in
// messages/*.json) is edited. A date-only value, rendered through the
// locale-aware, UTC-pinned `formatDateOnly` helper rather than hardcoded per
// language (a plain calendar date carries no zone).
const LAST_UPDATED = "2026-09-07";

// Section order is owned here, not in the message files, so the same structure
// renders for every locale. Each key maps to a flat
// `robloxTerms.sections.<key>` entry with a `heading` and a `blocks` array
// (ordered paragraphs and bulleted lists — see `policy-content.ts`). No section
// is incomplete, so none carries a "pending" notice.
const SECTIONS = [
  "involved",
  "eligibility",
  "whatsInvolved",
  "cost",
  "safety",
  "information",
  "media",
  "concern",
  "changes",
] as const;

export default async function RobloxTermsPage() {
  const t = await getTranslations("robloxTerms");
  const tLegal = await getTranslations("legal");
  const locale = await getLocale();

  return (
    <PolicyPage
      title={t("title")}
      // Raw, like the blocks below it — the subtitle is cross-reference-tagged
      // copy on every policy page, so it reaches `PolicyPage` untouched by ICU
      // whether or not this particular document's scope note names another one.
      subtitle={rawString(t.raw("subtitle"))}
      lastUpdated={t("lastUpdated", {
        date: formatDateOnly(LAST_UPDATED, locale, { dateStyle: "long" }),
      })}
      newTabLabel={tLegal("opensInNewTab")}
      draftNotice={tLegal("draftNotice")}
      intro={{
        heading: t("intro.heading"),
        blocks: rawPolicyBlocks(t.raw("intro.blocks")),
      }}
      sections={SECTIONS.map((key) => ({
        heading: t(`sections.${key}.heading`),
        blocks: rawPolicyBlocks(t.raw(`sections.${key}.blocks`)),
      }))}
    />
  );
}
