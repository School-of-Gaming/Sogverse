import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";

/**
 * **The Library's closing call to action**, the same card on the index and at
 * the end of every article: a reader who has finished reading is asked one
 * thing, and the shop is where it leads. It is the Roblox programme page's
 * closing card in shape and words — one world rule along the top, a question
 * and a button — without that page's scarcity line, which the Library has no
 * cause to make. `className` places it; the card sizes itself.
 */
export function LibraryClosingCta({ className }: { className?: string }) {
  const t = useTranslations("library.cta");

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
            {t("button")}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </CardContent>
      </Card>
    </section>
  );
}
