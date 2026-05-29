import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/utils";

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

  const introParagraphs = t.raw("intro.paragraphs") as string[];

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("lastUpdated", {
            date: formatDate(LAST_UPDATED, locale, { dateStyle: "long" }),
          })}
        </p>
      </div>

      {/* Plain-language summary up top — the one part we most want a hurried
          parent to actually read. */}
      <div className="mt-8 space-y-3 rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">{t("intro.heading")}</h2>
        {introParagraphs.map((p, i) => (
          <p key={i} className="text-muted-foreground">
            {p}
          </p>
        ))}
      </div>

      <div className="mt-10 space-y-10">
        {SECTIONS.map((key) => {
          const paragraphs = t.raw(`sections.${key}.paragraphs`) as string[];
          const bullets = t.has(`sections.${key}.bullets`)
            ? (t.raw(`sections.${key}.bullets`) as string[])
            : [];
          return (
            <section key={key} className="space-y-3">
              <h2 className="text-2xl font-bold">
                {t(`sections.${key}.heading`)}
              </h2>
              {paragraphs.map((p, i) => (
                <p key={i} className="text-muted-foreground">
                  {p}
                </p>
              ))}
              {bullets.length > 0 && (
                <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
                  {bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
