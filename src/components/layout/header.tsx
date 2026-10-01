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
  PublicDestinationLink,
  usePublicDestinations,
} from "@/components/layout/public-nav";
import { TabBar } from "@/components/layout/tab-bar";
import { trackDashboardNav } from "@/lib/analytics";

/** The badge's true viewBox, handed to `next/image` so it reserves the right box. */
const LOGO_INTRINSIC = { width: 379, height: 207.5 } as const;

/**
 * Every nav link's shape. The `min-h-11` is a real 44px touch target on a
 * phone: the words are 14px type, and a bare text link is a ~17px-tall strip
 * that is genuinely hard to hit. It costs nothing visible — the strip is 64px
 * tall and `items-center` keeps the text on the same baseline it was on — and
 * `px-2` widens the target so two adjacent links stop sharing an edge.
 *
 * `whitespace-nowrap` picks the failure mode for a full strip. The tightest
 * cases clear by under 20px (the measured table in the nav group below),
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
  // strip from `md` up, and in the tab bar below it. The storefront is a single
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
   * The gedu's own nav item: the sessions looking for a stand-in.
   *
   * Gedus only. It is the one place in the chrome where the nav depends on who
   * is looking, and it is deliberate: substituting is a standing part of the
   * job rather than something reached from one dashboard card, and no other
   * role has a page to send here.
   */
  const showsSubstitutions = navFor === "gedu";
  const isOnSubstitutions =
    pathname === ROUTES.gedu.substitutions ||
    pathname.startsWith(ROUTES.gedu.substitutions + "/");
  const isOnInvoicing =
    pathname === ROUTES.gedu.invoicing ||
    pathname.startsWith(ROUTES.gedu.invoicing + "/");
  /**
   * The gedu's My profile item: their own public profile, which they come back to
   * rather than set once. Only from `lg` up, like Invoicing — below that each
   * is a row in the avatar menu (`account-menu.tsx`), for the width reasons in
   * the nav group's note. Admins have one too but reach it from settings and their user page,
   * never from the chrome.
   */
  const showsTeamProfile = navFor === "gedu";
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
  // This is what stops a gedu's phone-width header, where that word is
  // `hidden`, from announcing a link to the dashboard as "School of Gaming".
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
        // override governs only its own nav row (the rehoused My profile),
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
   * The badge and its word make one lockup at every width, with one exception
   * for one role, stated where it is applied.
   */
  const brandText = logoHref === ROUTES.home ? (
    <SogWordmark height={15} className="text-foreground" />
  ) : (
    <span
      className={cn(
        "whitespace-nowrap text-base font-semibold transition-colors",
        // A gedu's phone strip carries Substitutions, and the word and the item
        // do not both fit at 360 or 390 (the table in the nav group below), so
        // below `sm` a gedu's badge stands alone. The tab bar's first tab is
        // the same destination under the same name, so nothing is lost.
        navFor === "gedu" && "hidden sm:inline",
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
    //
    // `gap-2` costs nothing when nothing is set beside it: a `display: none`
    // (or absent) flex item creates no gap.
    <span className="flex items-center gap-2">
      <Image
        src={sogLogoSimple}
        alt=""
        width={LOGO_INTRINSIC.width}
        height={LOGO_INTRINSIC.height}
        className="h-9 w-auto sm:h-11"
        unoptimized
      />
      {brandText}
    </span>
  );

  return (
    <>
      <SiteHeaderShell>
        <nav className="container mx-auto flex h-full items-center justify-between gap-2 px-3 sm:gap-3 sm:px-4">
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

            Below `md` the strip carries no public links at all: the tab bar
            (`tab-bar.tsx`, rendered below) holds them. From `md` up they are
            here, in the bar's order — Shop, Library, Team, About — and the logo
            is the Home / My SOG link. A gedu's own items lead the run.

            Every link carries its own 44px-tall, `px-2` touch target, and the
            group's `-ml-2` hands the outermost 8px of that padding back to the
            space on the logo's side. Between links the group adds `gap-1`, so
            two nav words sit 20px apart — the same distance as the last word
            from the picker (its 8px of padding plus the 12px gap), so the nav
            and the account chrome read as one even rhythm and still as two
            runs.

            **What fits, measured in a real browser** (headless Chromium against
            the dev server, px of strip left over between the logo and the right
            block). Signed out is the live header. The signed-in rows are the
            live header with the lockup word and the gedu items written into it
            in the header's own classes, since a headless run has no session —
            measured layout, synthesised content:

              width  who          en     fi     sv     fr    tlh
              360    signed out  25.3   25.3   25.3   25.3   25.3
                     parent      85.8   69.7   80.4   74.7   89.5
                     admin       57.4   24.0   81.0   14.9  113.3
                     gedu        48.1   61.1   85.8   91.6   84.8
              390    signed out  55.3   55.3   55.3   55.3   55.3
                     admin       87.4   54.0  111.0   44.9  143.3
                     gedu        78.1   91.1  115.8  121.6  114.8
              640    gedu       201.6  205.0  233.2  235.4  235.4
              768    signed out 134.4  121.7  112.3   40.3   96.2
                     admin      166.5  120.4  168.1   29.9  184.2
                     gedu        82.8   67.0   93.1   21.1   84.9
              1024   admin      422.5  376.4  424.1  285.9  440.2
                     gedu       166.0  139.3  164.0   17.9  149.2
              1280   gedu       422.0  395.3  420.0  273.9  405.2

            (A gamer's strip is a parent's. Every width from 360 to 1440 clears
            in every locale; the rows left out are roomier than the ones shown.)

            Three decisions fall out of it, and none is decoration:

            - **A gedu's badge stands alone below `sm`.** Substitutions is on the
              strip at every width, and beside it the "My SOG" word does not fit
              at 360 or 390 in English or Finnish (English is 22px short at
              360). The tab bar's first tab carries the same word to the same
              place.
            - **Substitutions sets its short form below `lg`.** Only French has
              one ("Rempl."), and it is what carries a French gedu's `md` strip
              (Substitutions plus four public links) clear at 21.1px; the whole
              word, 68px wider, does not fit there. The accessible name is the
              whole word at every width.
            - **My profile and Invoicing join at `lg`, together.** At `md` the
              public links take the room, and adding My profile there overflows
              French; at `lg` all three gedu items and all four public links fit
              in every locale, French last at 17.9px. Below `lg` both are rows
              in the account menu.

            **Do not add an item without redoing this table, per locale.**
            `NAV_LINK_CLASS`'s `whitespace-nowrap` is there so that the next word
            that does not fit overflows visibly instead of wrapping quietly
            inside its own box.
          */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="-ml-2 flex items-center gap-1">
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

                Invoicing and My profile join from `lg`; below it each is a row
                in the account menu, which hides the row at exactly the
                breakpoint written here.
              */}
              {showsSubstitutions && (
                <Link
                  href={ROUTES.gedu.invoicing}
                  className={cn(
                    NAV_LINK_CLASS,
                    "hidden lg:inline-flex",
                    isOnInvoicing ? "text-act" : "text-muted-foreground",
                  )}
                  aria-current={isOnInvoicing ? "page" : undefined}
                >
                  {t("invoicing")}
                </Link>
              )}
              {showsSubstitutions && (
                <Link
                  href={ROUTES.gedu.substitutions}
                  className={cn(
                    NAV_LINK_CLASS,
                    isOnSubstitutions ? "text-act" : "text-muted-foreground",
                  )}
                  aria-current={isOnSubstitutions ? "page" : undefined}
                  // The visible word is a locale's short form below `lg`, and in
                  // French that is an abbreviation. A screen reader must never be
                  // handed it, so the accessible name is stated here and is the
                  // whole word at every width, in every locale.
                  aria-label={t("nav.substitutions")}
                >
                  {/* Two spans in every locale, not one per locale that needs it:
                      four of the five set the same word in both keys, and the
                      uniform pair is what keeps this component free of any
                      per-locale branch. */}
                  <span className="lg:hidden">{t("nav.substitutionsPhone")}</span>
                  <span className="hidden lg:inline">
                    {t("nav.substitutions")}
                  </span>
                </Link>
              )}
              {/* Between Substitutions and the public links, per the owner, and
                  part of the same gedu-only leading run. */}
              {showsTeamProfile && (
                <Link
                  href={ROUTES.settingsTeamProfile}
                  className={cn(
                    NAV_LINK_CLASS,
                    isOnTeamProfile ? "text-act" : "text-muted-foreground",
                    "hidden lg:inline-flex",
                  )}
                  aria-current={isOnTeamProfile ? "page" : undefined}
                >
                  {t("teamProfile")}
                </Link>
              )}
              {/* From `md` up only: below it the tab bar carries them. */}
              {publicDestinations.map((destination) => (
                <PublicDestinationLink
                  key={destination.key}
                  destination={destination}
                  className={cn(
                    NAV_LINK_CLASS,
                    "hidden md:inline-flex",
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
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
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
