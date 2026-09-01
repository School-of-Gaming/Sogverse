import { HomePageBody } from "@/components/home/home-page-body";
import type { YtyPalette } from "@/lib/constants/yty";

/**
 * The public home page, under the live palette or one of the two draft doses.
 *
 * It takes no fixtures, because the page has no data: the hero, the feature
 * cards, how it works and the closing CTA are all translated copy over static
 * arrays. That makes it the one scene whose body is *literally* the live body
 * with nothing standing in for anything — the only thing the scenario chooses
 * is how much of that body the brand palette colours.
 *
 * **The Yty elements are not on this page**, and neither is the About copy: both
 * moved to `/about`, which the header points every reader at. So the palette's
 * most concentrated use is not in this scene at all — the element cards are
 * drawn as inline samples on the walkthrough deck instead, from the same colour
 * maps the About page reads, and this scene is the *dose* question only.
 *
 * The three scenarios exist to be switched between: the brand hues have to be
 * judged against the ones they replace, and the fastest honest comparison is the
 * same page at the same scroll position under each. `brand-palette` spends the
 * palette as accents; `brand-lively` spends it the way the brand's own marketing
 * does — whole tinted fields, and amber kept for the CTA alone.
 *
 * **Both drafts are flat.** Brand-hue gradients are a Sogverse invention rather
 * than a Guidebook construct and are retired by owner direction, so there is no
 * fourth scenario drawing the flat comparison — flat is what the drafts *are*.
 * The one blend still arguing its case, the dusk hero, lives as an exhibit on
 * the walkthrough deck's gradient slide rather than as a page here.
 *
 * **The hero's h1 stays in Press Start 2P under the draft, deliberately.** The
 * design pass reviews every Press Start 2P placement against the owner's
 * "rare and specialized uses" ruling, and this is the site the ruling is
 * *for*: the front page's one arcade sentence, seen once, by a stranger,
 * before anything else. Swapping it here would leave the face with no
 * flagship placement while keeping it loaded, which is the worst of both — so
 * the h1's *face* is unchanged across all three scenarios and the comparison
 * stays about the palette; what the lively doses change is its colour, from
 * amber and violet to white with a green marker stroke behind the payoff
 * words. The gamer dashboard's greeting is the placement that moves; that one
 * is a heading a child meets on every visit, which is the opposite of rare.
 */
export function HomeScene({ palette }: { palette: YtyPalette }) {
  return <HomePageBody palette={palette} />;
}
