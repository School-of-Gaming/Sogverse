import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Closing call-to-action for the partnership page — the second of the two
 * "start here" prompts, repeating the hero's for anyone who read to the bottom
 * before deciding.
 *
 * The programme does **not** get its own registration form. That was the earlier
 * plan — a superset of `/register`, landing in this component — and it was
 * dropped: programme families register exactly like everyone else, and the extra
 * consents the programme needs are collected at the point of joining the
 * product, driven off the product itself rather than off the sign-up route.
 * So this stays a call to action pointing at the standard flow.
 *
 * The button is deliberately inert while the copy is unsigned — see the note on
 * the hero CTA in the page for why nothing here navigates yet.
 */
export function PartnershipCta() {
  const t = useTranslations("roblox.cta");

  return (
    <section className="container mx-auto px-4 py-16 sm:py-24">
      <Card className="mx-auto max-w-3xl bg-gradient-to-r from-primary/10 to-secondary/10">
        <CardContent className="flex flex-col items-center py-12 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">{t("heading")}</h2>
          <p className="mt-4 max-w-xl text-muted-foreground">{t("body")}</p>
          <button
            type="button"
            className={buttonVariants({ size: "lg", className: "mt-8 gap-2" })}
          >
            {t("button")}
            <ArrowRight className="h-4 w-4" />
          </button>
        </CardContent>
      </Card>
    </section>
  );
}
