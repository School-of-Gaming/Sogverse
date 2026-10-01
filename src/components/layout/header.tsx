"use client";

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import sogLogoSimple from "@/assets/brand/sog-logo-simple.svg";
import { SogWordmark } from "@/components/brand/sog-wordmark";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { UnknownAvatar } from "@/components/ui/unknown-avatar";
import { useAuth } from "@/providers";
import { cn } from "@/lib/utils";
import {
  ROLE_DASHBOARD_PATHS,
  ROUTES,
  SENDER_NAME,
  type UserRole,
} from "@/lib/constants";
import { AccountMenu } from "@/components/layout/account-menu";
import { LocalePicker } from "@/components/layout/locale-picker";
import { hasOwnNavItem } from "@/components/layout/own-nav-item";
import { SiteHeaderShell } from "@/components/layout/site-header-shell";
import {
  isAtOrUnder,
  PublicDestinationLink,
  usePublicDestinations,
} from "@/components/layout/public-nav";
import { TabBar } from "@/components/layout/tab-bar";
import { trackDashboardNav } from "@/lib/analytics";

/** The badge's true viewBox, handed to `next/image` so it reserves the right box. */
const LOGO_INTRINSIC = { width: 379, height: 207.5 } as const;

/**
 * Every nav link's shape. The `min-h-11` is a real 44px touch target, which a
 * touch-screen laptop needs as much as anything: the words are 14px type, and
 * a bare text link is a ~17px-tall strip that is genuinely hard to hit. It
 * costs nothing visible — the strip is 64px tall and `items-center` keeps the
 * text on the same baseline it was on — and `px-2` widens the target so two
 * adjacent links stop sharing an edge.
 *
 * `whitespace-nowrap` picks the failure mode for a full strip. The tightest
 * case clears by under 20px (the measured table in the nav group below),
 * so a longer word in some future translation will overrun it — and a link
 * allowed to wrap absorbs that silently, breaking to two lines inside a 44px box
 * that then reads as a misaligned smudge nobody reports. Held on one line, the
 * same overrun is a visible overflow: obvious in the widest-locale check, and
 * fixed once rather than lived with.
 */
const NAV_LINK_CLASS =
  "inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-2 text-sm font-medium transition-colors hover:text-act";

interface HeaderProps {
  /**
   * Which role's **nav** to draw, in place of the signed-in viewer's own.
   *
   * For preview scenes and nothing else. A gedu-facing scene is opened by an
   * admin — `/preview/*` is admin-gated — so the real header renders the
   * admin's nav over a page the gedu is supposed to be looking at, and the
   * strip is part of what a full-page scene exists to let you judge. This
   * overrides the nav and only the nav: the account slot, the logo's
   * destination and every analytics call still read the real session, because
   * a scene is genuinely being looked at by the admin who opened it.
   */
  navRole?: UserRole;
}

export function Header({ navRole }: HeaderProps) {
  const pathname = usePathname();
  const { user, profile, isLoading } = useAuth();
  const t = useTranslations("header");
  const c = useTranslations("common");
  // "My SOG" — the name every role's dashboard goes by to the people using it.
  // Read from `dashboardSections`, the same key the dashboard bodies set as
  // their own page title, rather than from `metadata`: that namespace is
  // stripped from the client bundle and this is a client component.
  const d = useTranslations("dashboardSections");

  // The public destinations every visitor gets, in both auth states: on the
  // strip from `lg` up, and in the tab bar below it. The storefront is a single
  // Shop entry; every browseable product type — clubs, camps and events — is
  // reached from within it via the in-page category selector, so the nav never
  // grows a per-type link.
  const publicDestinations = usePublicDestinations(pathname);

  /**
   * Whose nav this is. The signed-in viewer's own role, unless a preview scene
   * has asked for somebody else's (see `navRole`).
   *
   * **The role is known at first paint, so nothing about the nav arrives
   * late.** The locale layout reads the profile server-side and seeds
   * `AuthProvider` with it, and the provider only goes looking for a profile
   * when the server handed it no user at all — so on every ordinary load the
   * very first render already knows this is a gedu, and the item below is in
   * the server HTML. There is exactly one residual window, the same one the
   * brand-text comment names: a session the *server* missed, where the browser
   * finds one and the profile lands a round trip later. The layout below is
   * what makes that window harmless — see the nav group's own note.
   */
  const navFor = navRole ?? profile?.role ?? null;

  /**
   * The gedu's own nav items: Invoicing (the month they invoice us for),
   * Substitutions (the sessions looking for a stand-in) and My profile (their
   * own public profile, which they come back to rather than set once).
   *
   * Gedus only. It is the one place in the chrome where the nav depends on who
   * is looking, and it is deliberate: each is a standing part of the job rather
   * than something reached from one dashboard card. Like every strip link they
   * are on the strip from `lg` up; below it they are rows in the account menu
   * (`account-menu.tsx`). Admins have a profile too but reach it from settings
   * and their user page, never from the chrome.
   */
  const showsGeduItems = navFor === "gedu";
  const isOnSubstitutions = isAtOrUnder(pathname, ROUTES.gedu.substitutions);
  const isOnInvoicing = isAtOrUnder(pathname, ROUTES.gedu.invoicing);
  const isOnTeamProfile = pathname === ROUTES.settingsTeamProfile;

  const isHome = pathname === ROUTES.home;

  const dashboardPath = profile?.role
    ? ROLE_DASHBOARD_PATHS[profile.role]
    : null;

  // Logo destination: every signed-in role goes to its own dashboard (parents
  // and gamers route straight there, past the family-selector interstitial).
  // Signed-out visitors go home.
  const logoHref = user && dashboardPath ? dashboardPath : ROUTES.home;
  // The visual "you're here" state for the logo follows whatever it links to —
  // its dashboard and the pages beneath it — less a page beneath it that has a
  // nav item of its own, or the strip would light two places at once and name
  // the reader's position twice. The account menu draws the same line.
  const isOnLogoTarget =
    logoHref === ROUTES.home
      ? isHome
      : (pathname === logoHref || pathname.startsWith(logoHref + "/")) &&
        !hasOwnNavItem(pathname);
  // What the logo's destination is called — "Dashboard" for the admin, whose
  // panel is genuinely an admin panel, and "My SOG" for every other role.
  const dashboardLabel =
    profile?.role === "admin" ? c("dashboard") : d("pageTitle");
  // The logo link's accessible name, which has to name where it goes rather
  // than what it is a picture of. Signed out it goes home and the brand is the
  // name of that destination; signed in it goes to the role's dashboard, so it
  // is called what the dashboard is called — the same string the visible word
  // beside it sets, and the same shape the avatar link's `aria-label` uses.
  const logoLabel = logoHref === ROUTES.home ? SENDER_NAME : dashboardLabel;

  /**
   * The account slot, in its four states — all of them the same 32px box in
   * the same place, so nothing on the strip moves as auth resolves:
   *
   *   - while auth is resolving, a non-interactive faded silhouette. The slot
   *     must not become a control that a hurried click could fire before we
   *     know whose account it belongs to;
   *   - signed in with a profile, the avatar is the trigger of the account
   *     menu, which owns everything that used to hang off this slot (the
   *     dashboard trip, the family switch, settings, sign-out);
   *   - signed in with the profile row still in flight, the identicon behind a
   *     link to login. The menu is built entirely from the role, so there is no
   *     menu to offer yet — but the slot is the only account affordance on the
   *     page and must never be a dead end, so it keeps the exit it had before
   *     the menu existed. Login is the right one precisely *because* a
   *     signed-in visitor never arrives there: the proxy looks their role up
   *     and bounces them straight to their own dashboard. What the trip buys is
   *     the repair — it is a full-page navigation, so the RSC reads the profile
   *     again and hands the root layout a header with its menu in place.
   *     Nothing about the session is re-established; the session was never the
   *     thing that failed, the profile read was;
   *   - signed out, a plain link to login, unchanged.
   */
  const accountSlot = isLoading ? (
    <span className="rounded-md">
      <Avatar className="h-8 w-8">
        <UnknownAvatar faded />
      </Avatar>
    </span>
  ) : user ? (
    profile ? (
      <AccountMenu
        userId={profile.id}
        role={profile.role}
        firstName={profile.first_name}
        registrationOwed={profile.registration_completed_at === null}
        // Carried through rather than resolved here: the menu's copy of the
        // override governs only its own nav rows (the gedu's three items),
        // exactly as this one governs only the strip.
        navRole={navRole}
      />
    ) : (
      <Link
        href={ROUTES.login}
        // Not "Sign in": this reader already is. The label names what the trip
        // actually does for them — the login route bounces a signed-in visitor
        // onward to their own account — and it stays role-agnostic, because the
        // profile that would say which dashboard is the thing that is missing.
        aria-label={t("continueToAccount")}
        className="rounded-md focus:outline-none focus:ring-2 focus:ring-act"
      >
        <Avatar className="h-8 w-8">
          <Identicon id={user.id} size={32} />
        </Avatar>
      </Link>
    )
  ) : (
    <Link
      href={ROUTES.login}
      aria-label={c("signIn")}
      className="rounded-md focus:outline-none focus:ring-2 focus:ring-act"
    >
      <Avatar className="h-8 w-8">
        <UnknownAvatar />
      </Avatar>
    </Link>
  );

  /**
   * What is set beside the badge — and it is a different thing
   * depending on who is looking, because the logo already links to two
   * different places:
   *
   *   - **Signed out** it goes home, and the word beside it is the brand, set
   *     in the mark's own letterforms (`SogWordmark`). The full mark's version
   *     of that line renders around 6px tall at any height a 64px strip allows,
   *     so it left the header; this is the same artwork at a legible size.
   *   - **Signed in** it goes to the role's dashboard, and the word beside it
   *     names that destination — "My SOG", or "Dashboard" for the admin, whose
   *     panel is genuinely an admin panel. It takes the nav links' own
   *     highlight, so the header says "you are here" in the one slot that is on
   *     every page.
   *
   * They are alternatives that never coexist, so nothing here reserves a hole
   * for the other one — and the two are very different widths, the wordmark
   * being more than twice the width of "My SOG". Which is why this keys on
   * `logoHref` rather than on `isLoading`: the loading window is exactly the
   * case where the server saw no session, so the signed-out wordmark is both
   * what the server renders and what the browser keeps. Holding the slot empty
   * until auth settled would pop a 123px word into every signed-out visitor's
   * header one frame after hydration, on every page. The layout below is
   * arranged so that even the rare late swap — a session the server missed —
   * moves nothing else on the strip.
   *
   * The badge and its word make one lockup at every width, for every role.
   */
  const brandText = logoHref === ROUTES.home ? (
    <SogWordmark height={15} className="text-foreground" />
  ) : (
    <span
      className={cn(
        "whitespace-nowrap text-base font-semibold transition-colors",
        isOnLogoTarget
          ? "text-act"
          : "text-muted-foreground group-hover:text-act",
      )}
    >
      {dashboardLabel}
    </span>
  );

  const logoBody = (
    // The badge is the one constant: same file, same size in every state, so it
    // never moves or resizes. Its `alt` is empty because the link around it
    // carries the accessible name (`logoLabel`) — the badge is not a second
    // thing to announce, and naming it "School of Gaming" beside a link that
    // goes to the dashboard would name the picture instead of the destination.
    // The true viewBox goes in as width/height, which is what lets `w-auto`
    // reserve the right box before the file lands.
    <span className="flex items-center gap-2">
      <Image
        src={sogLogoSimple}
        alt=""
        width={LOGO_INTRINSIC.width}
        height={LOGO_INTRINSIC.height}
        className="h-9 w-auto lg:h-11"
        unoptimized
      />
      {brandText}
    </span>
  );

  return (
    <>
      <SiteHeaderShell>
        <nav className="container mx-auto flex h-full items-center justify-between gap-2 px-3 lg:gap-3 lg:px-4">
          {/*
            Always a link, in every auth state — including while auth is still
            resolving, which is not a hazard here the way it is for the avatar.
            `isLoading` is seeded `!initialUser`, so a loading render is by
            construction one the *server* saw no session on: `user` is null,
            `logoHref` is necessarily home, and a hurried click goes exactly where
            the signed-out lockup beside it says it will. There is nothing to
            protect against, and holding the mark inert cost the two things that
            matter most on a public page — the logo is dead to the one visitor
            most likely to click it, and a crawler reading server HTML finds no
            link home at all. The analytics call is already gated on
            `profile?.role`, which is null in that window, so it cannot misfire
            either.
          */}
          <Link
            href={logoHref}
            className="group flex shrink-0 items-center"
            aria-label={logoLabel}
            aria-current={isOnLogoTarget ? "page" : undefined}
            onClick={() => {
              // The logo routes every signed-in role to its dashboard — record
              // which path they chose. Signed-out visitors have no role and
              // their logo goes home, so nothing fires.
              if (profile?.role) {
                trackDashboardNav({
                  role: profile.role,
                  method: "logo",
                  from: pathname,
                });
              }
            }}
          >
            {logoBody}
          </Link>

          {/*
            Two groups, not three: the logo, then everything else as one
            right-aligned block. The logo slot is the only part of the strip whose
            width depends on auth — the wordmark it sets when signed out is more
            than twice as wide as the "My SOG" it sets when signed in — and auth
            resolves on the data's own schedule, not on anything the reader did.
            With the nav centred between three `justify-between` groups it would
            have slid sideways as that resolved; anchored to the right edge, the
            links and the account cluster cannot move at all.

            The header has two layouts, switching at `lg` (1024px) for every
            role. Below `lg` — phones and tablets alike — the strip is the
            lockup, the locale picker and the account slot and nothing else, the
            same for every role: the tab bar (`tab-bar.tsx`, rendered below)
            carries the public destinations, and a gedu's own items are rows in
            the account menu. From `lg` up the strip carries the nav run: a
            gedu's Invoicing, Substitutions and My profile, then Shop, Library,
            Team and About, every one in its whole word. The logo is the Home /
            My SOG link at every width.

            Every link carries its own 44px-tall, `px-2` touch target, and the
            run's `-ml-2` hands the outermost 8px of that padding back to the
            space on the logo's side. Between links the run adds `gap-1`, so
            two nav words sit 20px apart — the same distance as the last word
            from the picker (its 8px of padding plus the 12px gap), so the nav
            and the account chrome read as one even rhythm and still as two
            runs.

            **What fits, measured in a real browser** (headless Chromium against
            the dev server, px of strip left over between the logo and the right
            block). Signed out is the live header. The signed-in rows are the
            live header with the lockup word and the gedu items written into it
            in the header's own classes, since a headless run has no session —
            measured layout, synthesised content. Below `lg` only the lockup's
            word varies, and the admin's is the longest dashboard name; from
            `lg` up a gedu's strip is the fullest.

              width  who          en     fi     sv     fr    tlh
              360    signed out  33.3   33.3   33.3   33.3   33.3
                     admin       65.4   32.0   89.0   22.9  121.3
              390    signed out  63.3   63.3   63.3   63.3   63.3
                     admin       95.4   62.0  119.0   52.9  151.3
              768    signed out 420.3  426.3  419.3  421.3  413.3
                     admin      452.4  425.0  475.0  410.9  501.3
              1024   signed out 398.7  385.7  376.7  304.7  360.7
                     gedu       174.2  147.1  171.8   26.1  156.9
              1280   signed out 654.7  641.7  632.7  560.7  616.7
                     gedu       430.2  403.1  427.8  282.1  412.9

            (1023 measures as 768 and 1440 as 1280: the container's width
            steps at those breakpoints. A parent's, gamer's or gedu's lockup
            word below `lg` is "My SOG", shorter than the admin's. Every width
            from 360 to 1440 clears in every locale, with no document
            overflow.) The tightest cases are a French admin at 360 ("Tableau
            de bord") and a French gedu at 1024 (three gedu items and four
            public links), clearing by 23 and 26px.

            **Do not add an item without redoing this table, per locale.**
            `NAV_LINK_CLASS`'s `whitespace-nowrap` is there so that the next word
            that does not fit overflows visibly instead of wrapping quietly
            inside its own box.
          */}
          <div className="flex items-center gap-2 lg:gap-3">
            <div className="-ml-2 hidden items-center gap-1 lg:flex">
              {/*
                First in the run, per the owner: a gedu's own destinations sit
                left of the public ones.

                That is also where the slack is, which is what makes the one
                window where these items can arrive late — a session the server
                missed — harmless. This whole block is anchored to the strip's
                right edge, so an item joining at its *leading* edge grows the
                group leftward into the space beside the logo; the public links,
                the picker and the avatar hold their positions to the pixel. It is
                the right-packed-run case of the late-arriving-mark rule, and the
                order is therefore load-bearing: putting a gedu item anywhere else
                in the run would push the links after it sideways.
              */}
              {showsGeduItems && (
                <>
                  <Link
                    href={ROUTES.gedu.invoicing}
                    className={cn(
                      NAV_LINK_CLASS,
                      isOnInvoicing ? "text-act" : "text-muted-foreground",
                    )}
                    aria-current={isOnInvoicing ? "page" : undefined}
                  >
                    {t("invoicing")}
                  </Link>
                  <Link
                    href={ROUTES.gedu.substitutions}
                    className={cn(
                      NAV_LINK_CLASS,
                      isOnSubstitutions ? "text-act" : "text-muted-foreground",
                    )}
                    aria-current={isOnSubstitutions ? "page" : undefined}
                  >
                    {t("nav.substitutions")}
                  </Link>
                  <Link
                    href={ROUTES.settingsTeamProfile}
                    className={cn(
                      NAV_LINK_CLASS,
                      isOnTeamProfile ? "text-act" : "text-muted-foreground",
                    )}
                    aria-current={isOnTeamProfile ? "page" : undefined}
                  >
                    {t("teamProfile")}
                  </Link>
                </>
              )}
              {publicDestinations.map((destination) => (
                <PublicDestinationLink
                  key={destination.key}
                  destination={destination}
                  className={cn(
                    NAV_LINK_CLASS,
                    destination.isActive ? "text-act" : "text-muted-foreground",
                  )}
                >
                  {destination.label}
                </PublicDestinationLink>
              ))}
            </div>

            {/* The settings cog used to sit here, ahead of the picker. It is now
                a row in the account menu: one affordance behind the avatar rather
                than two icons competing for the narrowest part of the strip. */}
            <div className="flex shrink-0 items-center gap-2 lg:gap-3">
              <LocalePicker />
              {accountSlot}
            </div>
          </div>
        </nav>
      </SiteHeaderShell>
      <TabBar
        pathname={pathname}
        first={{
          href: logoHref,
          label: logoHref === ROUTES.home ? t("nav.home") : dashboardLabel,
          isActive: isOnLogoTarget,
          onClick: () => {
            if (profile?.role) {
              trackDashboardNav({
                role: profile.role,
                method: "tab_bar",
                from: pathname,
              });
            }
          },
        }}
      />
    </>
  );
}
