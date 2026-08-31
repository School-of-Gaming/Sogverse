import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  YTY_ELEMENTS,
  ytyElementColor,
  type YtyPalette,
} from "@/lib/constants/yty";

interface YtySectionProps {
  /** Optional anchor id for scrollspy navigation. */
  id?: string;
  /**
   * Which Yty palette the element cards draw in. Defaults to the live one, so
   * the public route is untouched; the home preview scene passes `"brand"` to
   * show the design-pass draft. Retires when the draft palette promotes.
   */
  palette?: YtyPalette;
}

export function YtySection({ id, palette = "current" }: YtySectionProps) {
  const t = useTranslations("yty");

  return (
    // The `py-16` is what clears the /about section pill on an anchor landing —
    // the scroll offset covers the header only. See `section-pill.tsx`.
    <section id={id} className="container mx-auto scroll-mt-[var(--header-height)] px-4 py-16 sm:py-24">
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

      {/* Overview */}
      <div className="mx-auto mt-16 max-w-4xl">
        <Card className="bg-gradient-to-r from-primary/5 to-secondary/5">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{t("overview.heading")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-lg text-muted-foreground">{t("overview.paragraph1")}</p>
            <p className="text-lg text-muted-foreground">{t("overview.paragraph2")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Four Elements */}
      <div className="mx-auto mt-16 max-w-5xl">
        <h3 className="text-center text-2xl font-bold">{t("elements.heading")}</h3>
        <p className="mt-2 text-center text-muted-foreground">{t("elements.subheading")}</p>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {YTY_ELEMENTS.map((el) => {
            const color = ytyElementColor(el, palette);
            return (
              <Card key={el.id} className={`border-2 ${color.border}`}>
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${color.bg}`}>
                      <el.icon className={`h-6 w-6 ${color.accent}`} />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{t(`elements.${el.id}.name`)}</CardTitle>
                      <p className={`text-sm ${color.accent}`}>{t(`elements.${el.id}.description`)}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    {t(`elements.${el.id}.detail`)}
                  </CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Earning Yty */}
      <div className="mx-auto mt-16 max-w-3xl">
        <h3 className="text-center text-2xl font-bold">{t("earning.heading")}</h3>
        <div className="mt-8 space-y-6 text-muted-foreground">
          <p>{t("earning.paragraph1")}</p>
          <p>{t("earning.paragraph2")}</p>
          <p>{t("earning.paragraph3")}</p>
        </div>
      </div>
    </section>
  );
}
