import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Closing call-to-action for the partnership page.
 *
 * Deliberately its own component even though it currently renders nothing but
 * copy: the plan is for this page to eventually carry a superset of `/register`
 * (the partnership needs more from a family than the standard sign-up does), and
 * that lands here. Keeping the section isolated means growing it into a real
 * form is an edit to one file rather than surgery on the page.
 *
 * Until then it renders no button at all. An inert or disabled button would be
 * worse than none: it promises an action that does not exist, and a visitor who
 * clicks it learns nothing about why nothing happened.
 */
export function PartnershipCta() {
  const t = useTranslations("roblox.cta");

  return (
    <section className="container mx-auto px-4 py-16 sm:py-24">
      <Card className="mx-auto max-w-3xl bg-gradient-to-r from-primary/10 to-secondary/10">
        <CardContent className="flex flex-col items-center py-12 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">{t("heading")}</h2>
          <p className="mt-4 max-w-xl text-muted-foreground">{t("body")}</p>
          <p className="mt-8 text-xs uppercase tracking-widest text-muted-foreground/70">
            {t("note")}
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
