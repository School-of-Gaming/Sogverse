import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/utils";
import { rawStringArray } from "@/lib/i18n/raw-messages";
import { PolicyPage } from "@/components/legal/policy-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("privacy") };
}

// The date the policy *text* last changed — bump it whenever the copy below
// (in messages/*.json) is edited. Rendered through the locale-aware
// `formatDate` helper rather than hardcoded per language.
const LAST_UPDATED = "2026-05-29";

// Section order is owned here, not in the message files, so the same structure
// renders for every locale. Each key maps to `privacy.sections.<key>` with a
// `heading`, a `paragraphs` array, and an optional `bullets` array.
const SECTIONS = [
  "whoWeAre",
  "infoWeCollect",
  "childrensPrivacy",
  "howWeUse",
  "legalBasis",
  "providers",
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
  const locale = await getLocale();

  return (
    <PolicyPage
      title={t("title")}
      lastUpdated={t("lastUpdated", {
        date: formatDate(LAST_UPDATED, locale, { dateStyle: "long" }),
      })}
      intro={{
        heading: t("intro.heading"),
        paragraphs: rawStringArray(t.raw("intro.paragraphs")),
      }}
      sections={SECTIONS.map((key) => ({
        heading: t(`sections.${key}.heading`),
        paragraphs: rawStringArray(t.raw(`sections.${key}.paragraphs`)),
        bullets: t.has(`sections.${key}.bullets`)
          ? rawStringArray(t.raw(`sections.${key}.bullets`))
          : undefined,
      }))}
    />
  );
}
