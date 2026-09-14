import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { localizedPageMetadata } from "@/lib/metadata/localized-page";
import { formatDateOnly } from "@/lib/utils";
import { rawStringArray } from "@/lib/i18n/raw-messages";
import { PolicyPage } from "@/components/legal/policy-page";
import {
  paragraphsThenBullets,
  rawPolicyBlocks,
} from "@/components/legal/policy-content";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    ...(await localizedPageMetadata("/privacy", await getLocale())),
    title: t("pages.privacy"),
    description: t("descriptions.privacy"),
  };
}

// The date the policy *text* last changed — bump it whenever the copy below
// (in messages/*.json) is edited. A date-only value, rendered through the
// locale-aware, UTC-pinned `formatDateOnly` helper rather than hardcoded per
// language (a plain calendar date carries no zone).
const LAST_UPDATED = "2026-09-14";

// Section order is owned here, not in the message files, so the same structure
// renders for every locale. Each key maps to `privacy.sections.<key>` with a
// `heading` and its copy in one of two shapes: the original `paragraphs` array
// plus an optional trailing `bullets` array, or — where a section has to run
// paragraph → bullets → paragraph, which that shape cannot express — a single
// ordered `blocks` array (see `policy-content.ts`). A section declares one or
// the other; the builder below picks by which key is present.
const SECTIONS = [
  "whoWeAre",
  "infoWeCollect",
  "technical",
  "childrensPrivacy",
  "howWeUse",
  "legalBasis",
  "providers",
  "partners",
  "cookies",
  "voice",
  "retention",
  "storage",
  "rights",
  "security",
  "changes",
  "contact",
] as const;

export default async function PrivacyPage() {
  const t = await getTranslations("privacy");
  const tLegal = await getTranslations("legal");
  const locale = await getLocale();

  return (
    <PolicyPage
      title={t("title")}
      lastUpdated={t("lastUpdated", {
        date: formatDateOnly(LAST_UPDATED, locale, { dateStyle: "long" }),
      })}
      newTabLabel={tLegal("opensInNewTab")}
      intro={{
        heading: t("intro.heading"),
        blocks: paragraphsThenBullets(
          rawStringArray(t.raw("intro.paragraphs")),
        ),
      }}
      sections={SECTIONS.map((key) => ({
        heading: t(`sections.${key}.heading`),
        blocks: t.has(`sections.${key}.blocks`)
          ? rawPolicyBlocks(t.raw(`sections.${key}.blocks`))
          : paragraphsThenBullets(
              rawStringArray(t.raw(`sections.${key}.paragraphs`)),
              t.has(`sections.${key}.bullets`)
                ? rawStringArray(t.raw(`sections.${key}.bullets`))
                : undefined,
            ),
      }))}
    />
  );
}
