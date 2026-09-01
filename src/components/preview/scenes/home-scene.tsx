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
 * Two scenarios remain (2026-09-01): today's page, and the **ruled** accented
 * dose — tinted feature tiles, palette how-it-works circles, today's hero and
 * closing CTA kept exactly. The lively scenario is retired from the registry;
 * every construct it proposed was ruled out, and its slug now renders the same
 * ruled dose if an old link reaches it.
 *
 * **The hero's h1 is no longer a type comparison.** The pixel display face it
 * used to wear is retired from the product, so the h1 is settled Poppins at the
 * Guidebook's H1 on the live route and in every scenario alike — the type is
 * identical on both sides of the comparison, which is what keeps the comparison
 * about the palette. What the doses change is its colour.
 */
export function HomeScene({ palette }: { palette: YtyPalette }) {
  return <HomePageBody palette={palette} />;
}
