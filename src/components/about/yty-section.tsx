import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { YTY_ELEMENTS } from "@/lib/constants/yty";
import { Heading } from "@sog/ui";

interface YtySectionProps {
  /** Optional anchor id for scrollspy navigation. */
  id?: string;
}

export function YtySection({ id }: YtySectionProps) {
  const t = useTranslations("yty");

  return (
    // The `py-16` is what clears the /about section pill on an anchor landing —
    // the scroll offset covers the header only. See `section-pill.tsx`.
    <section id={id} className="container mx-auto scroll-mt-[var(--header-height)] px-4 py-16 sm:py-24">
      {/* Hero */}
      <div className="mx-auto max-w-3xl text-center">
        {/* Ink, like every heading a reader reads through. The hero headline
            is the library's one declared exception (`brand.ts`, beside the
            label rule) and this is a section heading. */}
        <Heading level={2} step="display" align="center">
          {t("hero.title")}
        </Heading>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">
          {t("hero.subtitle")}
        </p>
      </div>

      {/* Overview */}
      <div className="mx-auto mt-16 max-w-4xl">
        {/* The plain card ground: this block used to be washed act-to-world,
            and a brand colour is never blended into another. Nothing replaces
            it — the card is already lifted off the page, and a rule here would
            be the hero's mark spent on a paragraph. */}
        <Card>
          <CardHeader className="text-center">
            <Heading level={3} step="section" align="center">{t("overview.heading")}</Heading>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-lg text-muted-foreground">{t("overview.paragraph1")}</p>
            <p className="text-lg text-muted-foreground">{t("overview.paragraph2")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Four Elements */}
      <div className="mx-auto mt-16 max-w-5xl">
        <Heading level={3} step="section" align="center">{t("elements.heading")}</Heading>
        <p className="mt-2 text-center text-muted-foreground">{t("elements.subheading")}</p>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {YTY_ELEMENTS.map((el) => (
            <Card key={el.id} className="border-2 border-border">
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-lg border bg-lifted ${el.color.edge}`}
                  >
                    <el.icon className={`h-6 w-6 ${el.color.accent}`} />
                  </div>
                  <div>
                    <Heading level={4} step="card-title">{t(`elements.${el.id}.name`)}</Heading>
                    <p className={`text-sm ${el.color.accent}`}>{t(`elements.${el.id}.description`)}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {t(`elements.${el.id}.detail`)}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Earning Yty */}
      <div className="mx-auto mt-16 max-w-3xl">
        <Heading level={3} step="section" align="center">{t("earning.heading")}</Heading>
        <div className="mt-8 space-y-6 text-muted-foreground">
          <p>{t("earning.paragraph1")}</p>
          <p>{t("earning.paragraph2")}</p>
          <p>{t("earning.paragraph3")}</p>
        </div>
      </div>
    </section>
  );
}
