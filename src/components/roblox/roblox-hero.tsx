import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";
import { PartnerLockup } from "@/components/roblox/partner-lockup";

/**
 * The /roblox hero: three-beat pixel slogan, subtitle, CTA, partner lockup.
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
 * authored in the copy).
 *
 * The slogan has two size scales because the font is monospace at exactly 1em
 * per character, so a beat's width is just (characters x font-size) and the
 * two-column layout gives it half the container. English's longest beat is 8
 * characters and clears 60px; French's "Construisez" is 11 and does not. One
 * scale for both would mean shrinking English to fit French, so long copy gets
 * its own smaller scale — see `longBeats` below.
 */
export function RobloxHero() {
  const t = useTranslations("roblox");

  // Does any beat exceed the 8 characters the big scale allows? Read off the raw
  // message (the rendered title is React elements) with its tags stripped.
  const rawTitle: unknown = t.raw("hero.title");
  const longBeats =
    typeof rawTitle === "string" &&
    rawTitle.replace(/<[^>]+>/g, "\n").split("\n").some((beat) => beat.length > 8);

  const sloganSize = longBeats
    ? "text-2xl sm:text-4xl md:text-3xl lg:text-4xl xl:text-5xl"
    : "text-2xl sm:text-4xl lg:text-5xl xl:text-6xl";

  return (
    // Same gradient treatment as the home page hero, pulled up under the
    // translucent header, so the programme page reads as part of the same site
    // rather than a microsite bolted on.
    <section className="relative -mt-[var(--header-height)] overflow-hidden bg-[linear-gradient(to_bottom,_transparent_0%,_var(--color-background)_100%),linear-gradient(to_right,_color-mix(in_oklab,var(--color-act)_20%,transparent),_transparent_50%,_color-mix(in_oklab,var(--color-world)_10%,transparent))] pt-[var(--header-height)]">
      <div className="container mx-auto max-w-6xl px-4 py-20 sm:py-28">
        <div className="grid items-center gap-14 md:grid-cols-2 md:gap-12">
          <div className="text-center md:text-left">
            <h1 className={`font-display font-bold leading-snug ${sloganSize}`}>
              {t.rich("hero.title", {
                br: () => <br />,
                primary: (chunks) => <span className="text-act">{chunks}</span>,
                secondary: (chunks) => (
                  <span className="text-world">{chunks}</span>
                ),
              })}
            </h1>
            <p className="mt-6 text-lg leading-8 text-muted-foreground md:max-w-xl">
              {t("hero.subtitle")}
            </p>
            {/* Lands on the storefront filtered to the programme's own
                products. The closing CTA at the bottom of the page points at
                the same URL — a reader who scrolls past this one must not be
                offered a different destination for the same promise. */}
            <div className="mt-10 flex justify-center md:justify-start">
              <Link
                href={ROUTES.robloxShop}
                className={buttonVariants({ size: "lg", className: "gap-2" })}
              >
                {t("hero.cta")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* On mobile this lands under the CTA as a full-width centred row, so
              it keeps the hairline rule that separates it from the copy. From
              `md` it is a sibling column and the grid gap does that job. */}
          <div className="border-t border-border pt-12 md:flex md:justify-end md:border-t-0 md:pt-0">
            <PartnerLockup />
          </div>
        </div>
      </div>
    </section>
  );
}
