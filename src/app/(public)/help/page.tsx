import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Mail } from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import { FeedbackSectionContent } from "@/components/feedback/feedback-section-content";
import { Card, CardContent } from "@/components/ui/card";
import { SUPPORT_EMAIL } from "@/lib/constants";

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

// The Help page itself is public — anyone can read the FAQ. The feedback
// form needs a signed-in user (the API route requires auth and the email
// we send includes their name/role/email), so we gate it server-side here
// to avoid a post-hydration flash for signed-in visitors.
export default async function HelpPage() {
  const t = await getTranslations("help");
  const user = await getUser();

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-lg text-muted-foreground">{t("intro")}</p>
      </div>

      <Card className="mt-8">
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:gap-4">
          <Mail className="h-6 w-6 shrink-0 text-primary" />
          <div className="space-y-1">
            <h2 className="text-base font-semibold">{t("contact.heading")}</h2>
            <p className="text-sm text-muted-foreground">{t("contact.body")}</p>
            <p className="text-sm">
              {t("contact.emailLabel")}{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="font-medium text-primary hover:underline"
              >
                {SUPPORT_EMAIL}
              </a>
            </p>
          </div>
        </CardContent>
      </Card>

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

      {user && (
        <div className="mt-12">
          <FeedbackSectionContent />
        </div>
      )}
    </div>
  );
}
