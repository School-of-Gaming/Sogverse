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
 *
 * **The hero's h1 stays in Press Start 2P under the draft, deliberately.** The
 * design pass reviews every Press Start 2P placement against the owner's
 * "rare and specialized uses" ruling, and this is the site the ruling is
 * *for*: the front page's one arcade sentence, seen once, by a stranger,
 * before anything else. Swapping it here would leave the face with no
 * flagship placement while keeping it loaded, which is the worst of both — so
 * the h1 is unchanged between the two scenarios and the comparison stays about
 * the palette. The gamer dashboard's greeting is the placement that moves;
 * that one is a heading a child meets on every visit, which is the opposite of
 * rare.
 */
export function HomeScene({ palette }: { palette: YtyPalette }) {
  return <HomePageBody palette={palette} />;
}
