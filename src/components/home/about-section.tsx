import { useLocale, useTranslations } from "next-intl";
import { Heart, Shield, Sparkles, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AboutSectionProps {
  /** Optional anchor id for scrollspy navigation. */
  id?: string;
}

const valueIcons = [Sparkles, Heart, Shield, Users];
const valueKeys = ["playIsEssential", "friendsCarry", "keepChildrenSafe", "familyInTheLoop"] as const;

const easterEggRows = [
  "brandName", "tagline", "delete", "deleting", "close", "cancel", "getStarted",
  "password", "error", "english", "ok", "sorg", "copyright", "learnMore",
] as const;

export function AboutSection({ id }: AboutSectionProps) {
  const t = useTranslations("about");
  const locale = useLocale();

  const values = valueKeys.map((key, i) => ({
    key,
    title: t(`values.${key}.title`),
    description: t(`values.${key}.description`),
    icon: valueIcons[i],
  }));

  return (
    <section id={id} className="container mx-auto scroll-mt-16 px-4 py-16 sm:py-24">
      {/* Hero */}
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {t.rich("hero.title", {
            primary: (chunks) => <span className="text-primary">{chunks}</span>,
          })}
        </h2>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">
          {t("hero.subtitle")}
        </p>
      </div>

      {/* Quote */}
      <div className="mx-auto mt-16 max-w-3xl text-center">
        <blockquote className="text-xl italic text-muted-foreground">
          {t("quote.text")}
        </blockquote>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("quote.attribution")}
        </p>
      </div>

      {/* Mission */}
      <div className="mx-auto mt-16 max-w-4xl">
        <Card className="bg-gradient-to-r from-primary/5 to-secondary/5">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{t("mission.heading")}</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-lg text-muted-foreground">
              {t("mission.text")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Values */}
      <div className="mx-auto mt-16 max-w-5xl">
        <h3 className="text-center text-2xl font-bold">{t("values.heading")}</h3>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {values.map((value) => (
            <Card key={value.key}>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <value.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{value.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {value.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* How Clubs Work */}
      <div className="mx-auto mt-16 max-w-3xl">
        <h3 className="text-center text-2xl font-bold">{t("howClubsWork.heading")}</h3>
        <div className="mt-8 space-y-6 text-muted-foreground">
          <p>{t("howClubsWork.paragraph1")}</p>
          <p>{t("howClubsWork.paragraph2")}</p>
          <p>{t("howClubsWork.paragraph3")}</p>
          <p>{t("howClubsWork.paragraph4")}</p>
        </div>
      </div>

      {/* For Parents */}
      <div className="mx-auto mt-16 max-w-3xl">
        <h3 className="text-center text-2xl font-bold">{t("forParents.heading")}</h3>
        <div className="mt-8 space-y-6 text-muted-foreground">
          <p>{t("forParents.paragraph1")}</p>
          <p>{t("forParents.paragraph2")}</p>
        </div>
      </div>

      {/* Klingon Easter Egg — only renders when locale === "tlh".
          Inline hardcoded colours (#d00, #0a0a0a) are intentional here —
          these are Klingon Empire flag colours for a one-off easter egg,
          not brand/theme colours that belong in the design system. */}
      {/* eslint-disable i18next/no-literal-string -- Klingon easter egg: the "English"/"tlhIngan Hol"/"Literal meaning" reference headers are intentionally untranslated since this block only renders when locale === "tlh" */}
      {locale === "tlh" && (
        <div className="mx-auto mt-16 max-w-3xl">
          <Card
            className="overflow-hidden border"
            style={{ borderColor: "rgba(221,0,0,0.4)", backgroundColor: "#0a0a0a" }}
          >
            <div style={{ height: 2, background: "linear-gradient(90deg, transparent, #d00, transparent)" }} />
            <CardHeader className="text-center">
              {/* @ts-expect-error — easterEgg keys only exist in tlh locale */}
              <CardTitle className="text-2xl" style={{ color: "#d00" }}>{t("easterEgg.heading")}</CardTitle>
              <CardDescription className="text-base text-white/60">
                {/* @ts-expect-error — easterEgg keys only exist in tlh locale */}
                {t("easterEgg.intro")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left" style={{ borderColor: "rgba(221,0,0,0.3)" }}>
                      <th className="pb-2 pr-4 font-medium text-white/50">English</th>
                      <th className="pb-2 pr-4 font-medium text-white/50">tlhIngan Hol</th>
                      <th className="pb-2 font-medium text-white/50">Literal meaning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {easterEggRows.map((row) => (
                      <tr key={row} className="border-b" style={{ borderColor: "rgba(221,0,0,0.1)" }}>
                        {/* @ts-expect-error — easterEgg keys only exist in tlh locale */}
                        <td className="py-2 pr-4 text-white/70">{t(`easterEgg.${row}Label`)}</td>
                        {/* @ts-expect-error — easterEgg keys only exist in tlh locale */}
                        <td className="py-2 pr-4 font-mono" style={{ color: "#d00" }}>{t(`easterEgg.${row}Value`)}</td>
                        {/* @ts-expect-error — easterEgg keys only exist in tlh locale */}
                        <td className="py-2 italic text-white/40">{t(`easterEgg.${row}Meaning`)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-6 text-center text-xs text-white/30">
                {/* @ts-expect-error — easterEgg keys only exist in tlh locale */}
                {t("easterEgg.note")}
              </p>
              <p className="mt-4 text-center text-2xl font-bold" style={{ color: "#d00" }}>
                {/* @ts-expect-error — easterEgg keys only exist in tlh locale */}
                {t("easterEgg.qapla")}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
      {/* eslint-enable i18next/no-literal-string -- end of Klingon easter egg block */}
    </section>
  );
}
