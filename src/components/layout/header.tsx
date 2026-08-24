"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Settings } from "lucide-react";
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
import { LocalePicker } from "@/components/layout/locale-picker";
import { SiteHeaderShell } from "@/components/layout/site-header-shell";
import { trackDashboardNav } from "@/lib/analytics";

// Dashboard route prefixes used to detect whether the user is currently on a
// dashboard. Drives the avatar's active-ring state for roles whose avatar
// links to the dashboard rather than the family selector.
const DASHBOARD_PREFIXES = ["/admin", "/parent", "/gamer", "/gedu"];

// Roles whose header avatar routes to the family profile selector instead of
// their dashboard. Parents and gamers share one household, so the avatar is
// the "switch to another family member" affordance for both. Gedus and admins
// have a single profile, so their avatar goes to the dashboard alongside the
// logo.
const SELECTOR_ROLES = new Set<UserRole>(["customer", "gamer"]);

/** The badge's true viewBox, handed to `next/image` so it reserves the right box. */
const LOGO_INTRINSIC = { width: 379, height: 207.5 } as const;

/**
 * Every nav link's shape. The `min-h-11` is a real 44px touch target on a
 * phone: the words are 14px type, and a bare text link is a ~17px-tall strip
 * that is genuinely hard to hit. It costs nothing visible — the strip is 64px
 * tall and `items-center` keeps the text on the same baseline it was on — and
 * `px-2` widens the target so two adjacent links stop sharing an edge.
 *
 * `whitespace-nowrap` picks the failure mode for the 360px floor. The strip has
 * single-digit slack there in the widest locale (see the regrouping note below),
 * so a longer word in some future translation will overrun it — and a link
 * allowed to wrap absorbs that silently, breaking to two lines inside a 44px box
 * that then reads as a misaligned smudge nobody reports. Held on one line, the
 * same overrun is a visible overflow: obvious in the widest-locale check, and
 * fixed once rather than lived with.
 */
const NAV_LINK_CLASS =
  "inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-2 text-sm font-medium transition-colors hover:text-primary";

export function Header() {
  const pathname = usePathname();
  const { user, profile, isLoading } = useAuth();
  const t = useTranslations("header");
  const c = useTranslations("common");
  // "My SOG" — the name every role's dashboard goes by to the people using it.
  // Read from `dashboardSections`, the same key the dashboard bodies set as
  // their own page title, rather than from `metadata`: that namespace is
  // stripped from the client bundle and this is a client component.
  const d = useTranslations("dashboardSections");

  // The storefront is a single Shop entry; every browseable product type —
  // clubs, camps and events — is reached from within it via the in-page
  // category selector, so the nav never grows a per-type link.
  const navLinks = [
    { href: ROUTES.shop, label: t("nav.shop") },
    { href: ROUTES.help, label: t("nav.help") },
  ];

  const isHome = pathname === ROUTES.home;
  const isOnDashboard = DASHBOARD_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  const isOnSelectProfile =
    pathname === ROUTES.selectProfile ||
    pathname.startsWith(ROUTES.selectProfile + "/");
  const isOnSettings =
    pathname === ROUTES.settings || pathname.startsWith(ROUTES.settings + "/");

  const dashboardPath = profile?.role
    ? ROLE_DASHBOARD_PATHS[profile.role]
    : null;
  const usesSelector = !!profile?.role && SELECTOR_ROLES.has(profile.role);

  // Logo destination: every signed-in role goes to its own dashboard (parents
  // and gamers route straight there, past the family-selector interstitial).
  // Signed-out visitors go home.
  const logoHref = user && dashboardPath ? dashboardPath : ROUTES.home;
  // The visual "you're here" state for the logo follows whatever it links to.
  const isOnLogoTarget =
    logoHref === ROUTES.home
      ? isHome
      : pathname === logoHref || pathname.startsWith(logoHref + "/");
  // What the logo's destination is called — "Dashboard" for the admin, whose
  // panel is genuinely an admin panel, and "My SOG" for every other role.
  const dashboardLabel =
    profile?.role === "admin" ? c("dashboard") : d("pageTitle");
  // The logo link's accessible name, which has to name where it goes rather
  // than what it is a picture of. Signed out it goes home and the brand is the
  // name of that destination; signed in it goes to the role's dashboard, so it
  // is called what the dashboard is called — the same string the visible word
  // beside it sets, and the same shape the avatar link's `aria-label` uses.
  // This is what stops a phone-width signed-in header, where that word is
  // `hidden`, from announcing a link to the dashboard as "School of Gaming".
  const logoLabel = logoHref === ROUTES.home ? SENDER_NAME : dashboardLabel;

  // Avatar destination:
  //   - while auth is resolving, the slot stays non-interactive (a span);
  //   - signed-in parents/gamers go to the family profile selector;
  //   - other signed-in roles go to their dashboard;
  //   - signed-out visitors go to login.
  const avatarHref = isLoading
    ? null
    : user
      ? usesSelector
        ? ROUTES.selectProfile
        : (dashboardPath ?? ROUTES.login)
      : ROUTES.login;
  // The active-ring state tracks the avatar's link target the same way the
  // logo's own state tracks its.
  const isOnAvatarTarget =
    avatarHref === ROUTES.selectProfile ? isOnSelectProfile : isOnDashboard;
  const avatarLabel = user
    ? usesSelector
      ? t("selectProfile")
      : c("dashboard")
    : c("signIn");

  const avatarContent = isLoading ? (
    <UnknownAvatar faded />
  ) : user ? (
    <Identicon id={profile?.id || user.id} size={32} />
  ) : (
    <UnknownAvatar />
  );

  const avatarFrame = (
    <Avatar
      className={cn(
        "h-8 w-8 transition-shadow",
        isOnAvatarTarget && "ring-2 ring-primary",
      )}
    >
      {avatarContent}
    </Avatar>
  );

  /**
   * What is set beside the badge from `sm` up — and it is a different thing
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
   * Below `sm` the badge stands alone in every state, so a phone sees no change
   * at all whatever auth does.
   */
  const brandText = logoHref === ROUTES.home ? (
    <SogWordmark height={15} className="hidden text-foreground sm:block" />
  ) : (
    <span
      className={cn(
        "hidden whitespace-nowrap text-base font-semibold transition-colors sm:inline",
        isOnLogoTarget
          ? "text-primary"
          : "text-muted-foreground group-hover:text-primary",
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

          Every link carries its own 44px-tall, `px-2` touch target, and the
          group's `-ml-2` hands the outermost 8px of that padding back to the
          space on the logo's side. That does not make the touch targets free,
          and it would be wrong to say it did: two links at `px-2` add 16px
          each, `-ml-2` returns 8 of the 32, and the `gap-2` holding this group
          off the account cluster is fixed — so a phone-width strip is roughly
          24px wider than it was. The 360px floor still clears in the widest
          locale, but with single-digit slack, which is what `NAV_LINK_CLASS`'s
          `whitespace-nowrap` is there for: the next word that does not fit
          overflows visibly instead of wrapping quietly inside its own box.

          The padding on the *right* is deliberately kept: it separates the last
          link from the cog by the gap plus 8px, so the nav words and the
          account chrome don't read as one run.
        */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="-ml-2 flex items-center sm:gap-2">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    NAV_LINK_CLASS,
                    isActive ? "text-primary" : "text-muted-foreground",
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {user && (
              <Link
                href={ROUTES.settings}
                aria-label={c("settings")}
                aria-current={isOnSettings ? "page" : undefined}
                className={cn(
                  "rounded-md p-1 transition-colors hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring",
                  isOnSettings ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Settings className="h-5 w-5" />
              </Link>
            )}
            <LocalePicker />
            {avatarHref ? (
              <Link
                href={avatarHref}
                aria-label={avatarLabel}
                aria-current={isOnAvatarTarget ? "page" : undefined}
                className="rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                onClick={() => {
                  // Only the gedu avatar links straight to the dashboard;
                  // parents'/gamers' avatar opens the family selector, where the
                  // self-tile click is tracked instead.
                  if (profile?.role === "gedu") {
                    trackDashboardNav({
                      role: "gedu",
                      method: "avatar",
                      from: pathname,
                    });
                  }
                }}
              >
                {avatarFrame}
              </Link>
            ) : (
              <span className="rounded-md">{avatarFrame}</span>
            )}
          </div>
        </div>
      </nav>
    </SiteHeaderShell>
  );
}
