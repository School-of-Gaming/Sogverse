import { HomePageBody } from "@/components/home/home-page-body";
import type { YtyPalette } from "@/lib/constants/yty";

/**
 * The public home page, under one Yty palette or the other.
 *
 * It takes no fixtures, because the page has no data: hero, features, how it
 * works, about, the Yty section and the closing CTA are all translated copy
 * over static arrays. That makes it the one scene whose body is *literally*
 * the live body with nothing standing in for anything — the only thing the
 * scenario chooses is which palette the four element cards draw in.
 *
 * The two scenarios exist to be switched between: the brand hues have to be
 * judged against the ones they replace, and the fastest honest comparison is
 * the same page at the same scroll position under each.
 */
export function HomeScene({ palette }: { palette: YtyPalette }) {
  return <HomePageBody palette={palette} />;
}
