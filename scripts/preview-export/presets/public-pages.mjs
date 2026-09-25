/**
 * **Public pages** — Home, About and the shop, as a first-time visitor who is
 * not signed in meets them, in every real locale, at both widths.
 *
 *   node scripts/preview-export/export.mjs --preset public-pages --base https://sogverse.sog.gg
 *   node scripts/preview-export/export.mjs --preset public-pages --base http://localhost:3021 --locales en,fi
 *
 * **Signed out by what it is.** A signed-in reader of `/` is sent to their
 * dashboard, and the consent banner only ever appears to someone who has not
 * answered it, so these pages photographed signed in are pictures of a page no
 * prospective family sees.
 *
 * **Three pictures of each page**, because the owner judges every look-and-feel
 * change at both widths and judges the first screen twice — a phone shows far
 * less of it, and the banner covers more of it there:
 *
 *   - the first screen as it arrives, cookie banner up;
 *   - the first screen once the banner's own "Reject all" has dismissed it;
 *   - the whole page after rejecting, top to bottom.
 *
 * Each is a separate first visit in a fresh browser, so no picture depends on
 * what an earlier one clicked.
 *
 * **One group per page, which is one image per page.** A reviewer's unit is a
 * page: its first screens and its full length belong in one picture, and three
 * files post as a single message.
 *
 * Routes are internal paths. The proxy redirects each to its translated slug
 * (`/fi/shop` → `/fi/kauppa`), so this list never goes stale when a slug does.
 */

const PAGES = [
  { key: "home", label: "Home", route: "/" },
  { key: "about", label: "About", route: "/about" },
  { key: "shop", label: "Shop", route: "/shop" },
];

const groups = PAGES.map(({ key, label, route }) => ({
  label,
  entries: [
    {
      slug: `${key}--first-visit`,
      label: "First screen — first visit, cookie banner up",
      route,
      capture: "viewport",
      banner: "up",
    },
    {
      slug: `${key}--first-screen`,
      label: "First screen — after “Reject all”",
      route,
      capture: "viewport",
    },
    {
      slug: `${key}--full`,
      label: "Whole page — after “Reject all”",
      route,
      capture: "fullPage",
    },
  ],
}));

const preset = {
  title: "Public pages",
  description:
    "Home, About and the shop as a signed-out first-time visitor sees them, banner up and dismissed, in each locale at two widths.",
  signedOut: true,
  groups,
};

export default preset;
