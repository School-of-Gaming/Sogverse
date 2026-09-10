import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";

/**
 * Closing call-to-action for the programme page — the second of the two
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
 * It targets the *same* filtered storefront URL as the hero CTA, deliberately:
 * this is that CTA repeated for a reader who scrolled, and two "start here"
 * prompts landing in different places would be two different promises.
 */
export function ProgrammeCta() {
  const t = useTranslations("roblox.cta");

  return (
    <section className="container mx-auto px-4 py-16 sm:py-24">
      <Card className="relative mx-auto max-w-3xl overflow-hidden">
        {/* The card is the plain card ground with one world rule along its
            top edge — the hero's construct, so the page opens and closes on
            the same idea. It used to be washed act-to-world; two brand
            colours blended into each other is a smear, and act here would
            only repeat the colour of the button inside the card. */}
        <div className="absolute inset-x-0 top-0 h-[3px] bg-world" />
        <CardContent className="flex flex-col items-center py-12 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">{t("heading")}</h2>
          <p className="mt-4 max-w-xl text-muted-foreground">{t("body")}</p>
          <Link
            href={ROUTES.robloxShop}
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
