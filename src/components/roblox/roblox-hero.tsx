import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";
import { PartnerLockup } from "@/components/roblox/partner-lockup";

/**
 * The /roblox hero: three-beat slogan, subtitle, CTA, partner lockup.
 *
 * **One column on mobile, two from `md`.** The slogan is centred and small on
 * mobile and goes flush left beside the partner marks on desktop, because the
 * two viewports have opposite problems. At 56px the three lines measure roughly
 * 250 / 200 / 180px, so centring them makes a ragged triangle that reads as
 * accidental; a shared left edge turns that stagger into structure. At 30px on
 * mobile the same stagger is small enough that centring is simply the better
 * balance, and there is no width to put anything beside it anyway.
 *
 * The marks going into the right column is what fills the space the flush-left
 * copy leaves, and it puts the credibility signal beside the promise rather
 * than below it. `PartnerLockup` handles its own row-to-stack switch at the
 * same breakpoint.
 *
 * **The slogan is Poppins at the Guidebook's H1** — 48–56px / SemiBold 600 /
 * line-height 1.1, with 30px as the mobile step. No `text-balance` (the line
 * breaks are authored in the copy).
 *
 * **One scale, and the character-count branch that used to pick between two is
 * gone.** That branch was arithmetic for a 1em-advance face: a beat's width was
 * exactly (characters x font-size), so French's 11-character "Construisez" blew
 * past English's 8 at the same size and needed its own smaller scale. Poppins
 * SemiBold averages ~0.55em per character, which halves every beat and lets one
 * scale carry every locale. The binding case is French at `md`, where the
 * two-column grid is tightest: `max-w-6xl px-4` gives 736px of content at a
 * 768px viewport, and `md:gap-12` leaves 344px per column — "Construisez" at
 * 6.05em sets 290px at 48px, so 48 is the `md` step and 56 waits for `lg`
 * (472px of column). At the 360px floor the hero is one full-width column with
 * 328px of content, where the same beat is 182px at 30px.
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
            <h1 className="font-sans text-3xl font-semibold leading-[1.1] sm:text-5xl lg:text-[56px]">
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
          <div className="border-t pt-12 md:flex md:justify-end md:border-t-0 md:pt-0">
            <PartnerLockup />
          </div>
        </div>
      </div>
    </section>
  );
}
