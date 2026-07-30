import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PartnerLockup } from "@/components/roblox/partner-lockup";

/**
 * The /roblox hero: three-beat pixel slogan, subtitle, inert CTA, partner
 * lockup.
 *
 * **One column on mobile, two from `md`.** The slogan is centred and small on
 * mobile and goes flush left beside the partner marks on desktop, because the
 * two viewports have opposite problems. At 60px the three lines measure roughly
 * 480 / 420 / 360px, so centring them makes a ragged triangle that reads as
 * accidental; a shared left edge turns that stagger into structure. At 24px on
 * mobile the same stagger is small enough that centring is simply the better
 * balance, and there is no width to put anything beside it anyway.
 *
 * The marks going into the right column is what fills the space the flush-left
 * copy leaves, and it puts the credibility signal beside the promise rather
 * than below it. `PartnerLockup` handles its own row-to-stack switch at the
 * same breakpoint.
 *
 * `font-display` is Press Start 2P. No `tracking-tight` (negative tracking
 * smudges pixel glyphs together) and no `text-balance` (the line breaks are
 * authored in the copy). The slogan holds at 48px until `lg` because 8
 * characters at 60px is 480px, which does not clear a half-width column before
 * then.
 */
export function RobloxHero() {
  const t = useTranslations("roblox");

  return (
    // Same gradient treatment as the home page hero, pulled up under the
    // translucent header, so the programme page reads as part of the same site
    // rather than a microsite bolted on.
    <section className="relative -mt-[var(--header-height)] overflow-hidden bg-[linear-gradient(to_bottom,_transparent_0%,_hsl(var(--background))_100%),linear-gradient(to_right,_hsl(var(--primary)/0.2),_transparent_50%,_hsl(var(--secondary)/0.1))] pt-[var(--header-height)]">
      <div className="container mx-auto max-w-6xl px-4 py-20 sm:py-28">
        <div className="grid items-center gap-14 md:grid-cols-2 md:gap-12">
          <div className="text-center md:text-left">
            <h1 className="font-display text-2xl font-bold leading-snug sm:text-4xl md:text-5xl lg:text-6xl">
              {t.rich("hero.title", {
                br: () => <br />,
                primary: (chunks) => <span className="text-primary">{chunks}</span>,
                secondary: (chunks) => (
                  <span className="text-secondary">{chunks}</span>
                ),
              })}
            </h1>
            <p className="mt-6 text-lg leading-8 text-muted-foreground md:max-w-xl">
              {t("hero.subtitle")}
            </p>
            {/* Inert on purpose. The storefront cannot express this programme
                yet, so every CTA on the page is a <button> that goes nowhere
                rather than an href onto an empty shop. */}
            <div className="mt-10 flex justify-center md:justify-start">
              <button
                type="button"
                className={buttonVariants({ size: "lg", className: "gap-2" })}
              >
                {t("hero.cta")}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* On mobile this lands under the CTA as a full-width centred row, so
              it keeps the hairline rule that separates it from the copy. From
              `md` it is a sibling column and the grid gap does that job. */}
          <div className="border-t pt-12 md:flex md:justify-end md:border-t-0 md:pt-0">
            <PartnerLockup />
          </div>
        </div>
      </div>
    </section>
  );
}
