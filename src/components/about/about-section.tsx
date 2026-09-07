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
  "password", "error", "english", "ok", "copyright", "learnMore",
  // Retired names, kept as lore — see easterEgg.retiredNote below the table.
  "privacy", "terms", "honor",
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
    // The `py-16` is load-bearing beyond spacing: it is the only thing keeping
    // an anchor landing clear of the /about section pill, which the scroll
    // offset above does not account for. See `section-pill.tsx` for the
    // arithmetic and the ~12px it leaves.
    <section id={id} className="container mx-auto scroll-mt-[var(--header-height)] px-4 py-16 sm:py-24">
      {/* Hero */}
      <div className="mx-auto max-w-3xl text-center">
        {/* A section heading, not a hero: it is read through, so it is ink.
            The one heading the library lets carry a coloured phrase is a
            public page's hero headline (`brand.ts`, beside the label rule),
            and a section heading is not one. */}
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {t("hero.title")}
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
        {/* The plain card ground: this block used to be washed act-to-world,
            and a brand colour is never blended into another. Nothing replaces
            it — the card is already lifted off the page, and a rule here would
            be the hero's mark spent on a paragraph. */}
        <Card>
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
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-act bg-lifted">
                    <value.icon className="h-6 w-6 text-act" />
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
          The inline #d00 and #0a0a0a are the Klingon Empire's colours, not the
          brand's: this card is a picture of an Empire console, so it carries its
          own paint and takes the artwork exemption in eslint.config.mjs — the
          day act changes, the console should not follow.
          Three of the words are painted in the Empire's red as part of the
          artwork — the console's title, its Klingon column and its sign-off.
          The prose around them is not artwork: it is ordinary secondary text
          and takes the app's two inks (the English column is what a reader
          scans and takes `foreground`; the rest is quiet ink). */}
      {/* eslint-disable i18next/no-literal-string -- Klingon easter egg: the "English"/"tlhIngan Hol"/"Literal meaning" reference headers are intentionally untranslated since this block only renders when locale === "tlh" */}
      {locale === "tlh" && (
        <div className="mx-auto mt-16 max-w-3xl">
          <Card
            className="overflow-hidden border border-border"
            style={{ borderColor: "rgba(221,0,0,0.4)", backgroundColor: "#0a0a0a" }}
          >
            <div style={{ height: 2, background: "linear-gradient(90deg, transparent, #d00, transparent)" }} />
            <CardHeader className="text-center">
              {/* @ts-expect-error — easterEgg keys only exist in tlh locale */}
              <CardTitle className="text-2xl" style={{ color: "#d00" }}>{t("easterEgg.heading")}</CardTitle>
              <CardDescription className="text-base text-muted-foreground">
                {/* @ts-expect-error — easterEgg keys only exist in tlh locale */}
                {t("easterEgg.intro")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left" style={{ borderColor: "rgba(221,0,0,0.3)" }}>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">English</th>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">tlhIngan Hol</th>
                      <th className="pb-2 font-medium text-muted-foreground">Literal meaning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {easterEggRows.map((row) => (
                      <tr key={row} className="border-b border-border" style={{ borderColor: "rgba(221,0,0,0.1)" }}>
                        {/* @ts-expect-error — easterEgg keys only exist in tlh locale */}
                        <td className="py-2 pr-4 text-foreground">{t(`easterEgg.${row}Label`)}</td>
                        {/* @ts-expect-error — easterEgg keys only exist in tlh locale */}
                        <td className="py-2 pr-4 font-mono" style={{ color: "#d00" }}>{t(`easterEgg.${row}Value`)}</td>
                        {/* @ts-expect-error — easterEgg keys only exist in tlh locale */}
                        <td className="py-2 italic text-muted-foreground">{t(`easterEgg.${row}Meaning`)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-6 text-xs leading-5 text-muted-foreground">
                {/* @ts-expect-error — easterEgg keys only exist in tlh locale */}
                {t("easterEgg.retiredNote")}
              </p>
              <p className="mt-4 text-center text-xs text-muted-foreground">
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
