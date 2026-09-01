import { HomePageBody } from "@/components/home/home-page-body";

/**
 * The public home page.
 *
 * It takes no fixtures, because the page has no data: the hero, the feature
 * cards, how it works and the closing CTA are all translated copy over static
 * arrays. That makes it the one scene whose body is *literally* the live body
 * with nothing standing in for anything — which is also why it has exactly one
 * scenario. There is no state for a second one to hold.
 *
 * **The Yty elements are not on this page**, and neither is the About copy:
 * both live on `/about`, which the header points every reader at.
 */
export function HomeScene() {
  return <HomePageBody />;
}
