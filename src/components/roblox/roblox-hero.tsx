import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";
import { PartnerLockup } from "@/components/roblox/partner-lockup";

/**
 * The /roblox hero: the programme name, its three-beat tagline, CTA, partner
 * lockup.
 *
 * **The headline is the programme's own name**, stacked over two lines with the
 * closing word in act — the same treatment the three-beat slogan it replaced
 * had, and what the programme's OG card draws. Every locale carries its own
 * name (the same one its legal pages and page title use), so the split is at
 * the last word of that name rather than at a fixed word count. The three beats
 * are now the subtitle, which is where the promise reads once the name is
 * saying what the page is.
 *
 * **One column on mobile, two from `md`.** The headline is centred and small on
 * mobile and goes flush left beside the partner marks on desktop, because the
 * two viewports have opposite problems. At the desktop size the two lines are
 * of unequal measure, so centring them reads as accidental and a shared left
 * edge turns the stagger into structure. On mobile the same stagger is small
 * enough that centring is simply the better balance, and there is no width to
 * put anything beside it anyway.
 *
 * The marks going into the right column is what fills the space the flush-left
 * copy leaves, and it puts the credibility signal beside the promise rather
 * than below it. `PartnerLockup` handles its own row-to-stack switch at the
 * same breakpoint.
 *
 * The headline takes the app face, which is proportional: it carries no face
 * class of its own and inherits the one `<body>` sets. No `tracking-tight` and
 * no `text-balance` (the line breaks are authored in the copy).
 *
 * The headline still has two size scales, because the longest translation still
 * has to fit: the two-column layout gives the headline half the container, and
 * French's "des Créateurs" is the line that overflows where English's longest
 * does not. One scale for both would mean shrinking English to fit French, so
 * long copy gets its own smaller scale — see `longBeats` below. The mechanism
 * counts characters, not pixels, which was exact under a monospaced face and is
 * an approximation under a proportional one. Whether two scales are still
 * needed at the app face's widths, and what a hero should do about its longest
 * translation in general, is the library's hero question and is not decided
 * here.
 */
export function RobloxHero() {
  const t = useTranslations("roblox");

  // Does any line exceed the 8 characters the big scale allows? Read off the raw
  // message (the rendered title is React elements) with its tags stripped.
  const rawTitle: unknown = t.raw("hero.title");
  const longBeats =
    typeof rawTitle === "string" &&
    rawTitle.replace(/<[^>]+>/g, "\n").split("\n").some((beat) => beat.length > 8);

  // The wider sizes are still this component's and wait for the Heading
  // adoption. The narrow one is where the two scales differ most: the library
  // pins a narrow H1 step because a hero *slogan* cannot fit a phone at the
  // full H1 size, and a short name can — so a headline whose lines all fit the
  // big scale takes the full step on a phone too, and only the long
  // translations fall back. The same character count decides both, so there is
  // one switch and not two.
  const sloganSize = longBeats
    ? "text-4xl md:text-3xl lg:text-4xl xl:text-5xl"
    : "text-h1 xl:text-6xl";

  return (
    // Same treatment as the home page hero, pulled up under the translucent
    // header, so the programme page reads as part of the same site rather than
    // a microsite bolted on: the page ground and one world rule under the
    // headline, where a two-hue wash used to be — and the headline drawn the
    // hero way the library declares (`brand.ts`, beside the label rule), the
    // payoff beat in act and the rest in ink, which is what the programme's
    // own OG card draws too.
    <section className="relative -mt-[var(--header-height)] overflow-hidden pt-[var(--header-height)]">
      {/* The narrow padding is tighter than the wide one on purpose: the
          section opens under the translucent header, so on a phone every
          pixel here is spent before the headline and counts against getting
          the name, the rule and the tagline above the fold. */}
      <div className="container mx-auto max-w-6xl px-4 py-16 sm:py-28">
        <div className="grid items-center gap-14 md:grid-cols-2 md:gap-12">
          <div className="text-center md:text-left">
            {/* Shrink-to-fit, so the rule runs the headline's own measure —
                centred under it on a phone, left-aligned beside the lockup
                from `md`, with nothing measured at runtime. */}
            <div className="inline-block">
              <h1 className={`font-bold leading-snug ${sloganSize}`}>
                {t.rich("hero.title", {
                  br: () => <br />,
                  act: (chunks) => <span className="text-act">{chunks}</span>,
                })}
              </h1>
              <span className="mt-6 block h-1.5 w-full rounded-full bg-world sm:mt-8" />
            </div>
            {/* The tagline is the promise, so it is drawn in ink at a size of
                its own rather than in the muted grey a supporting sentence
                takes: the headline now says what the page *is*, and the three
                beats are the only place the page says what a reader will do. */}
            <p className="mt-6 text-xl font-medium leading-8 sm:text-2xl md:max-w-xl">
              {t("hero.subtitle")}
            </p>
            {/* What the tagline leaves out and a first-time reader still needs
                in the hero: that it costs nothing, who it is for, and what they
                walk away with. Supporting copy, so it keeps the muted grey and
                the body size the tagline gave up — and it is two short
                sentences because on a phone the name, the rule and the tagline
                all have to clear the fold above it. The three partner names it
                used to carry are the lockup's job. */}
            <p className="mt-4 text-lg leading-8 text-muted-foreground md:max-w-xl">
              {t("hero.blurb")}
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
