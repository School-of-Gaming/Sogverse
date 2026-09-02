import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { BrandSpectrumRule } from "@/components/ui/brand-spectrum-rule";
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
      {/* Neutral ground. This card copies the home page's closing CTA, but the
          amber→violet wash is sanctioned *there* and the exemption list is
          closed — a brand hue mixed down into a surface is no longer that hue,
          and the two sanctioned keeps are the hero band and the home closing
          CTA, both in the home page body.
          Flat six-family draft, P10 — owner to review; the gradient alternative
          is home's kept construct, and this is the direct comparison: the same
          card, at the bottom of the other first-contact page, washed there and
          ruled here. The two /about marketing cards draw the same rule. */}
      <Card className="mx-auto max-w-3xl overflow-hidden bg-muted">
        <BrandSpectrumRule />
        <CardContent className="flex flex-col items-center py-12 text-center">
          <h2 className="text-2xl font-semibold sm:text-3xl">{t("heading")}</h2>
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
