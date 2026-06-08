import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/utils";
import { PolicyPage } from "@/components/legal/policy-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("terms") };
}

// The date the terms *text* last changed — bump it whenever the copy below
// (in messages/*.json) is edited. Rendered through the locale-aware
// `formatDate` helper rather than hardcoded per language.
const LAST_UPDATED = "2026-06-08";

// Section order is owned here, not in the message files, so the same structure
// renders for every locale. Each key maps to `terms.sections.<key>` with a
// `heading`, a `paragraphs` array, and an optional `bullets` array.
const SECTIONS = [
  "whoWeAre",
  "service",
  "games",
  "online",
  "pricing",
  "clubsCancellation",
  "campsCancellation",
  "conduct",
  "privacy",
  "changes",
  "contact",
] as const;

export default async function TermsPage() {
  const t = await getTranslations("terms");
  const locale = await getLocale();

  return (
    <PolicyPage
      title={t("title")}
      lastUpdated={t("lastUpdated", {
        date: formatDate(LAST_UPDATED, locale, { dateStyle: "long" }),
      })}
      intro={{
        heading: t("intro.heading"),
        paragraphs: t.raw("intro.paragraphs") as string[],
      }}
      sections={SECTIONS.map((key) => ({
        heading: t(`sections.${key}.heading`),
        paragraphs: t.raw(`sections.${key}.paragraphs`) as string[],
        bullets: t.has(`sections.${key}.bullets`)
          ? (t.raw(`sections.${key}.bullets`) as string[])
          : undefined,
      }))}
    />
  );
}
