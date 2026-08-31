import { HomePageBody } from "@/components/home/home-page-body";

/**
 * The public home page.
 *
 * Everything it draws lives in `HomePageBody`, which the preview scene renders
 * too — the page has no data shell to speak of (translations and static arrays,
 * no fetching), so the route is the body and the composition around it.
 */
export default function HomePage() {
  return <HomePageBody />;
}
