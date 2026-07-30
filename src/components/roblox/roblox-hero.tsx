import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PartnerLockup } from "@/components/roblox/partner-lockup";
import { rawString } from "@/lib/i18n/raw-messages";

/**
 * Slogan type scale per character budget, narrowest budget first. See the
 * component doc below for the arithmetic behind each step and why `md` steps
 * down rather than up in the wider budget.
 */
const SLOGAN_SIZES = [
  { maxChars: 8, className: "text-2xl sm:text-4xl lg:text-5xl xl:text-6xl" },
  { maxChars: 11, className: "text-2xl sm:text-4xl md:text-3xl lg:text-4xl xl:text-5xl" },
] as const;

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
 * authored in the copy).
 *
 * **The slogan's size is derived from the copy, not fixed.** Press Start 2P is a
 * true monospace whose every glyph advances exactly 1000/1000 units — 1em per
 * character, verified from the font's own hmtx table — so a line's width is
 * simply (characters x font-size), and the two-column layout gives it only half
 * the container. That makes the safe size a pure function of the longest line,
 * and locales differ: "Build It" is 8 characters, French "Construisez" is 11.
 *
 * Picking one size for the longest locale would shrink the slogan for everyone,
 * so `SLOGAN_SIZES` holds a step per budget and the longest line selects it.
 * Verified against the column at each breakpoint:
 *
 *     8 chars    sm 36px / 608px avail   md 36px / 344px   lg 48px / 472px   xl 60px / 536px
 *                   288px OK               288px OK          384px OK          480px OK
 *     11 chars   sm 36px / 608px avail   md 30px / 344px   lg 36px / 472px   xl 48px / 536px
 *                   396px OK               330px OK          396px OK          528px OK
 *
 * Two things that look like mistakes and are not. The jump to 60px waits for
 * `xl` because at `lg` even 8 characters would need 480px of a 472px column. And
 * the 11-character step *decreases* from `sm` to `md`, because `md` is where the
 * grid splits and the available width drops from 608px to 344px.
 *
 * A locale longer than the largest budget wraps, which for a slogan whose whole
 * point is one beat per line is the one failure that matters — so add a step
 * here rather than letting it wrap.
 */
export function RobloxHero() {
  const t = useTranslations("roblox");

  // Longest beat in this locale's slogan, which selects the size step above.
  // Measured off the raw message because the rendered output is React elements:
  // strip the rich-text tags, split on the authored line breaks, take the max.
  const longestBeat = Math.max(
    ...rawString(t.raw("hero.title"))
      .split("<br></br>")
      .map((beat) => beat.replace(/<[^>]+>/g, "").length),
  );
  const sloganSize =
    SLOGAN_SIZES.find(({ maxChars }) => longestBeat <= maxChars) ??
    SLOGAN_SIZES[SLOGAN_SIZES.length - 1];

  return (
    // Same gradient treatment as the home page hero, pulled up under the
    // translucent header, so the programme page reads as part of the same site
    // rather than a microsite bolted on.
    <section className="relative -mt-[var(--header-height)] overflow-hidden bg-[linear-gradient(to_bottom,_transparent_0%,_hsl(var(--background))_100%),linear-gradient(to_right,_hsl(var(--primary)/0.2),_transparent_50%,_hsl(var(--secondary)/0.1))] pt-[var(--header-height)]">
      <div className="container mx-auto max-w-6xl px-4 py-20 sm:py-28">
        <div className="grid items-center gap-14 md:grid-cols-2 md:gap-12">
          <div className="text-center md:text-left">
            <h1
              className={`font-display font-bold leading-snug ${sloganSize.className}`}
            >
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
