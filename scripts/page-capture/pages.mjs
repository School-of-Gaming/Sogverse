/**
 * The surfaces a capture run photographs.
 *
 * This is the file to edit for a feature review: add the pages your change
 * touches, delete the ones it does not, and run `capture.mjs`. Nothing else in
 * the tool knows what a page is.
 *
 * Each entry is:
 *
 *   slug      stable file-name stem — this is what `--only` matches, and what
 *             makes a shot from one run comparable to a shot from the next, so
 *             renaming one breaks that comparison on purpose.
 *   route     a path, or a function of the seed state for anything carrying an
 *             id. Taking the whole state means a route can be built from
 *             several ids without this file knowing which.
 *   as        which signed-in viewer: "public" | "parent" | "gamer" | "gedu" | "admin".
 *   viewports which of the named viewports to shoot. Defaults to both.
 *   fullPage  false to shoot the viewport only. Defaults to true.
 *   waitFor   optional selector to settle on before shooting.
 *   notes     free text that lands in the manifest beside the shot.
 */

/**
 * 1440×900 is the desktop the gedu and admin surfaces are designed for; 360×800
 * is the mobile design floor the parent and gamer surfaces are designed at.
 * Both are shot for public, family and gedu pages. **Admin pages shoot desktop
 * only** (owner ruling, 2026-09-02): admin is desktop-default by the layout
 * rules, and its mobile layout is not a review surface.
 */
export const VIEWPORTS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
  mobile: { width: 360, height: 800, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

export const PAGES = [
  // -- Public, signed out ---------------------------------------------------
  { slug: "public-home", route: "/", as: "public" },
  { slug: "public-shop", route: "/shop", as: "public" },
  {
    slug: "public-product",
    route: (s) => s.routes.publicProduct,
    as: "public",
    notes: "The live temp club's public page.",
  },
  { slug: "public-about", route: "/about", as: "public" },
  { slug: "public-roblox", route: "/roblox", as: "public" },
  { slug: "public-privacy", route: "/privacy", as: "public" },
  { slug: "public-schools", route: "/schools", as: "public" },
  { slug: "auth-login", route: "/login", as: "public" },
  { slug: "auth-register", route: "/register", as: "public" },
  { slug: "auth-register-gedu", route: "/register-gedu", as: "public" },
  { slug: "auth-forgot-password", route: "/forgot-password", as: "public" },

  // -- Parent ---------------------------------------------------------------
  {
    slug: "parent-select-profile",
    route: "/select-profile",
    as: "parent",
    notes: "PIN-exempt, so it is reached without unlocking.",
  },
  {
    slug: "parent-dashboard",
    route: "/parent",
    as: "parent",
    notes:
      "Two cards per child: the live club, ringed and mid-session, and the " +
      "upcoming one whose first session is days away.",
  },
  {
    slug: "parent-club",
    route: (s) => s.routes.parentProduct,
    as: "parent",
    notes:
      "The family product page for the LIVE club: past sessions with the " +
      "gedu's reports, plus the one in progress. The upcoming club's copy of " +
      "this page is the same page with an empty feed, so it is not shot.",
  },
  {
    slug: "parent-gamer-profile",
    route: (s) => s.routes.parentGamer,
    as: "parent",
  },
  { slug: "parent-change-pin", route: "/parent/change-pin", as: "parent" },
  { slug: "parent-settings", route: "/settings", as: "parent" },

  // -- Gamer ----------------------------------------------------------------
  {
    slug: "gamer-dashboard",
    route: "/gamer",
    as: "gamer",
    notes: "The child's copy of the same two cards — live club and upcoming club.",
  },
  {
    slug: "gamer-club",
    route: (s) => s.routes.gamerProduct,
    as: "gamer",
    notes: "The LIVE club, as the child sees it.",
  },

  // -- Gedu -----------------------------------------------------------------
  { slug: "gedu-dashboard", route: "/gedu", as: "gedu" },
  {
    slug: "gedu-workspace",
    route: (s) => s.routes.geduProduct,
    as: "gedu",
    notes:
      "The LIVE club's group workspace and its session feed — the write-up " +
      "surface. The seeded history is what makes this page worth photographing.",
  },
  { slug: "gedu-contract", route: "/gedu/contract", as: "gedu" },

  // -- Admin ----------------------------------------------------------------
  //
  // Desktop only (owner ruling, 2026-09-02) — admin is a desktop surface and
  // its narrow layout is not reviewed from screenshots. The admin copy of the
  // group workspace is deliberately absent: it renders the same body the gedu
  // workspace shot already shows (owner: sufficiently covered by the gedu and
  // gamer shots).
  { slug: "admin-dashboard", route: "/admin", as: "admin", viewports: ["desktop"] },
  { slug: "admin-users", route: "/admin/users", as: "admin", viewports: ["desktop"] },
  {
    slug: "admin-user-detail",
    route: (s) => s.routes.adminUser,
    as: "admin",
    viewports: ["desktop"],
    notes: "The seeded gedu, showing the certification and record-check controls.",
  },
  { slug: "admin-clubs", route: "/admin/consumer-clubs", as: "admin", viewports: ["desktop"] },
  {
    slug: "admin-club-detail",
    route: (s) => s.routes.adminProduct,
    as: "admin",
    viewports: ["desktop"],
  },
  { slug: "admin-sites", route: "/admin/sites", as: "admin", viewports: ["desktop"] },
  { slug: "admin-tools", route: "/admin/tools", as: "admin", viewports: ["desktop"] },
  {
    slug: "admin-ui-components",
    route: "/admin/ui-components",
    as: "admin",
    viewports: ["desktop"],
    notes: "The living style guide — the one page that shows every variant at once.",
  },

  // -- The live voice room --------------------------------------------------
  //
  // Viewport-mode rather than full-page: the room is a fixed-height app shell,
  // and a full-page shot of one would add nothing but empty ground below it.
  //
  // One route, two viewers, and the difference between the shots is the whole
  // reason both are here: `/voice/group/[id]` does no membership check of its
  // own — the token endpoint decides who gets in and who gets moderator rights
  // — so the same URL renders the moderator's controls for the gedu and the
  // participant's for the child. A design pass over the room has to see both,
  // and neither costs more than the other.
  {
    slug: "voice-room-gedu",
    route: (s) => s.routes.voiceRoom,
    as: "gedu",
    fullPage: false,
    voice: true,
    notes: "Joined room, moderator view. Depends on the live session window and Daily keys.",
  },
  {
    slug: "voice-room-gamer",
    route: (s) => s.routes.voiceRoom,
    as: "gamer",
    fullPage: false,
    voice: true,
    notes:
      "The same live room as the child sees it — participant, not moderator. " +
      "A family reaches it from the live card on their dashboard.",
  },
];
