import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";

/**
 * Closing call-to-action for the partnership page — the second of the two
 * "start here" prompts, repeating the hero's destination for anyone who read to
 * the bottom before deciding.
 *
 * Kept as its own component because the plan is for this page to eventually
 * carry a superset of `/register` (the programme needs more from a family than
 * the standard sign-up does), and that lands here. Growing it into a real form
 * is then an edit to one file rather than surgery on the page.
 *
 * The button's destination is provisional — see `ROUTES.robloxTeenPrograms` for
 * the two model gaps that currently make it land on an empty shop.
 */
export function PartnershipCta() {
  const t = useTranslations("roblox.cta");

  return (
    <section className="container mx-auto px-4 py-16 sm:py-24">
      <Card className="mx-auto max-w-3xl bg-gradient-to-r from-primary/10 to-secondary/10">
        <CardContent className="flex flex-col items-center py-12 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">{t("heading")}</h2>
          <p className="mt-4 max-w-xl text-muted-foreground">{t("body")}</p>
          <Link
            href={ROUTES.robloxTeenPrograms}
            className={buttonVariants({ size: "lg", className: "mt-8 gap-2" })}
          >
            {t("button")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </CardContent>
      </Card>
    </section>
  );
}
