import { cn } from "@/lib/utils";

/**
 * The six brand families, side by side, each at the value it was authored at.
 *
 * **A flat six-family draft (P10) — the owner is reviewing it.** It replaces
 * the amber→violet wash on the marketing cards that used to carry one, after
 * the owner asked whether six brand colours can make a surface colourful with
 * no gradient at all. The gradient alternative is still live on the home page
 * (its hero band and closing CTA are the two sanctioned keeps), so the two can
 * be compared in the product: home's closing CTA washes, `/roblox`'s draws this
 * rule.
 *
 * Why it is legal where the wash was not, in one line each:
 *
 * - **No pixel leaves the palette.** Six flat blocks, no blend — the retired
 *   construct's sin was compositing two families into a third colour that is
 *   neither, and there is no interpolation here to do that.
 * - **No tint.** Every block is a token at full value, so the shading rule has
 *   nothing to catch: the ground behind the card stays neutral and the brand
 *   arrives at authored strength, which is exactly the shape the rule asks for.
 * - **Decorative, so the grammar is free.** The rule states no fact and labels
 *   nothing, which is the case where colour is spent on identity rather than
 *   meaning — and showing all six in equal width is the ensemble rule drawn
 *   literally: the four tertiaries get exactly the room the two leads get.
 *
 * The order is amber → harmony → glow → valor → wit → violet: the two brand
 * leads hold the ends and the four elements run between them, so the wash's
 * amber-to-violet journey survives as six discrete steps. The four tertiaries
 * are in the same order the home page's feature cards take them.
 *
 * Decorative and `aria-hidden`: a screen reader gains nothing from six empty
 * divs, and the card's heading already says what the card is.
 */
export function BrandSpectrumRule({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("flex h-2 w-full", className)}>
      <div className="flex-1 bg-primary" />
      <div className="flex-1 bg-yty-harmony-strong" />
      <div className="flex-1 bg-yty-glow-strong" />
      <div className="flex-1 bg-yty-valor-strong" />
      <div className="flex-1 bg-yty-wit-strong" />
      <div className="flex-1 bg-secondary" />
    </div>
  );
}
