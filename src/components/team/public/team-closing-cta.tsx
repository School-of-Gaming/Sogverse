import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";

/**
 * **The Team pages' closing call to action**, the same card under the index
 * and under every profile: a parent who has met the people is asked one
 * thing, and the shop is where it leads. The Library's closing card in shape
 * — one world rule along the top, a question and a button — with the home
 * page's own button, "Find a club", so the site asks for one thing in one
 * set of words. `className` places it; the card sizes itself.
 */
export function TeamClosingCta({ className }: { className?: string }) {
  const t = useTranslations("team.public.cta");
  const tHome = useTranslations("home");

  return (
    <section className={className}>
      <Card className="relative mx-auto max-w-3xl overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-world" />
        <CardContent className="flex flex-col items-center py-12 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">{t("heading")}</h2>
          <Link
            href={ROUTES.shop}
            className={buttonVariants({ size: "lg", className: "mt-8 gap-2" })}
          >
            {tHome("findClub")}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </CardContent>
      </Card>
    </section>
  );
}
