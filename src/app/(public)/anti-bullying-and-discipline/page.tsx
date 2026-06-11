import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/utils";
import { rawStringArray } from "@/lib/i18n/raw-messages";
import { PolicyPage } from "@/components/legal/policy-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("antiBullying") };
}

// The date the policy *text* last changed — bump it whenever the copy below
// (in messages/*.json) is edited. Rendered through the locale-aware
// `formatDate` helper rather than hardcoded per language.
const LAST_UPDATED = "2026-06-08";

// Section order is owned here, not in the message files, so the same structure
// renders for every locale. Each key maps to `discipline.sections.<key>` with a
// `heading`, a `paragraphs` array, and an optional `bullets` array. The `step*`
// keys are the rungs of our discipline ladder, in escalating order.
const SECTIONS = [
  "commitment",
  "approach",
  "step1",
  "step2",
  "step3",
  "step4",
  "step5",
  "step6",
  "partnership",
  "contact",
] as const;

export default async function AntiBullyingPage() {
  const t = await getTranslations("discipline");
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
