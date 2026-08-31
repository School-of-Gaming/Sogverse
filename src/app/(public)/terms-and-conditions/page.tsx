import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDateOnly } from "@/lib/utils";
import { rawStringArray } from "@/lib/i18n/raw-messages";
import { PolicyPage } from "@/components/legal/policy-page";
import { paragraphsThenBullets } from "@/components/legal/policy-content";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("terms") };
}

// The date the terms *text* last changed — bump it whenever the copy below
// (in messages/*.json) is edited. A date-only value, rendered through the
// locale-aware, UTC-pinned `formatDateOnly` helper rather than hardcoded per
// language (a plain calendar date carries no zone).
const LAST_UPDATED = "2026-08-31";

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
        date: formatDateOnly(LAST_UPDATED, locale, { dateStyle: "long" }),
      })}
      intro={{
        heading: t("intro.heading"),
        blocks: paragraphsThenBullets(
          rawStringArray(t.raw("intro.paragraphs")),
        ),
      }}
      sections={SECTIONS.map((key) => ({
        heading: t(`sections.${key}.heading`),
        blocks: paragraphsThenBullets(
          rawStringArray(t.raw(`sections.${key}.paragraphs`)),
          t.has(`sections.${key}.bullets`)
            ? rawStringArray(t.raw(`sections.${key}.bullets`))
            : undefined,
        ),
      }))}
    />
  );
}
