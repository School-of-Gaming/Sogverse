import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { HelpFeedbackGate } from "./help-feedback-gate";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("help") };
}

const FAQ_KEYS = [
  "whatIsSogverse",
  "productTypes",
  "whoLeads",
  "safety",
  "howToStart",
] as const;

export default function HelpPage() {
  const t = useTranslations("help");

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-lg text-muted-foreground">{t("intro")}</p>
      </div>

      <section className="mt-12 space-y-6">
        <h2 className="text-2xl font-bold">{t("faq.heading")}</h2>
        <div className="space-y-6">
          {FAQ_KEYS.map((key) => (
            <div key={key} className="space-y-2">
              <h3 className="text-lg font-semibold">
                {t(`faq.items.${key}.q`)}
              </h3>
              <p className="text-muted-foreground">
                {t(`faq.items.${key}.a`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-12">
        <HelpFeedbackGate />
      </div>
    </div>
  );
}
