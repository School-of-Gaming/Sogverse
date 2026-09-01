import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDateOnly } from "@/lib/utils";
import { rawString } from "@/lib/i18n/raw-messages";
import { PolicyPage } from "@/components/legal/policy-page";
import { rawPolicyBlocks } from "@/components/legal/policy-content";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("robloxSafeguarding"),
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

// The date the policy *text* was last reviewed — the document states an annual
// review cycle, so this is a review date rather than an edit date. A date-only
// value, rendered through the locale-aware, UTC-pinned `formatDateOnly` helper
// rather than hardcoded per language (a plain calendar date carries no zone).
const LAST_UPDATED = "2026-08-31";

// Section order is owned here, not in the message files, so the same structure
// renders for every locale. Each key maps to a flat
// `robloxSafeguarding.sections.<key>` entry with a `heading` and a `blocks`
// array (ordered paragraphs and bulleted lists — see `policy-content.ts`).
//
// `pending` names the message holding the "this is not written yet" marker for
// the three places the source document leaves a hole. Two are whole missing
// sections and share the generic notice; the third is a contact address nobody
// has decided on yet, so it says so specifically. We render the marker rather
// than inventing the copy or quietly dropping the heading.
const SECTIONS = [
  { key: "covers", pending: null },
  { key: "vetting", pending: "pendingSection" },
  { key: "online", pending: null },
  { key: "inPerson", pending: "pendingSection" },
  { key: "behaviour", pending: null },
  { key: "escalation", pending: null },
  { key: "concern", pending: "pendingContact" },
  { key: "data", pending: null },
  { key: "review", pending: null },
] as const;

export default async function RobloxSafeguardingPage() {
  const t = await getTranslations("robloxSafeguarding");
  const tLegal = await getTranslations("legal");
  const locale = await getLocale();

  return (
    <PolicyPage
      title={t("title")}
      // Raw, like the blocks below it: the subtitle names another of our legal
      // documents and carries the cross-reference tag for it, which `PolicyPage`
      // parses. Running it through ICU instead would demand a tag handler here.
      subtitle={rawString(t.raw("subtitle"))}
      lastUpdated={t("lastUpdated", {
        date: formatDateOnly(LAST_UPDATED, locale, { dateStyle: "long" }),
      })}
      draftNotice={tLegal("draftNotice")}
      intro={{
        heading: t("intro.heading"),
        blocks: rawPolicyBlocks(t.raw("intro.blocks")),
      }}
      sections={SECTIONS.map(({ key, pending }) => ({
        heading: t(`sections.${key}.heading`),
        blocks: rawPolicyBlocks(t.raw(`sections.${key}.blocks`)),
        pending:
          pending === "pendingContact"
            ? t("pendingContact")
            : pending === "pendingSection"
              ? tLegal("pendingSection")
              : undefined,
      }))}
    />
  );
}
