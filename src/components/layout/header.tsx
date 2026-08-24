"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Settings } from "lucide-react";
import sogLogoFull from "@/assets/brand/sog-logo-full.svg";
import sogLogoSimple from "@/assets/brand/sog-logo-simple.svg";
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

/** The mark's true viewBox, handed to `next/image` so it reserves the right box. */
const LOGO_INTRINSIC = { width: 379, height: 207.5 } as const;

/**
 * Every nav link's shape. The `min-h-11` is a real 44px touch target on a
 * phone: the words are 14px type, and a bare text link is a ~17px-tall strip
 * that is genuinely hard to hit. It costs nothing visible — the strip is 64px
 * tall and `items-center` keeps the text on the same baseline it was on — and
 * `px-2` widens the target so two adjacent links stop sharing an edge.
 */
const NAV_LINK_CLASS =
  "inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium transition-colors hover:text-primary";

// TEMP: header-nav exploration — strip before merge.
// Where a labelled "My SOG" item sits, and what it looks like. `"none"` is what
// ships today; the rest exist so the /preview/header-nav scene can put them side
// by side before one is picked and wired for real.
export type HeaderNavOption =
  | "none"
  | "trailing-pill"
  | "leading-link"
  | "cluster-pill";

// TEMP: header-nav exploration — strip before merge.
// The classes each option gives the My SOG item, split so the active state can
// be applied on top of the resting one.
const MY_SOG_CLASS: Record<
  Exclude<HeaderNavOption, "none">,
  { base: string; idle: string; active: string }
> = {
  // A. The last nav item, as a filled primary pill — the highest-contrast thing
  // on the strip, reading as "the button" rather than as a third word.
  // Already primary, so it cannot say "here" the way the text links do; an
  // inset hairline is the nearest equivalent that does not invert the fill.
  "trailing-pill": {
    base: "ml-1 inline-flex min-h-11 items-center rounded-full bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90",
    idle: "",
    active: "ring-1 ring-inset ring-primary-foreground/40",
  },
  // B. The first nav item, styled exactly like Shop and Help — nearest the
  // logo, where the eye starts, and saying "here" with the same muted → primary
  // shift its siblings use.
  "leading-link": {
    base: NAV_LINK_CLASS,
    idle: "text-muted-foreground",
    active: "text-primary",
  },
  // C. A quiet pill in the right cluster, beside the cog and the avatar —
  // "your stuff" grouped with "you". Outlined rather than filled so it does not
  // fight A's read, and it keeps the nav's muted → primary active shift.
  "cluster-pill": {
    base: "inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-medium ring-1 transition-colors",
    idle: "bg-muted/50 text-muted-foreground ring-border hover:text-primary",
    active: "bg-primary/15 text-primary ring-primary/40",
  },
};

// TEMP: header-nav exploration — strip before merge.
// How the brand is drawn from `sm` up.
//   - "full-mark"      — what ships: the badge with its own "SCHOOL OF GAMING"
//                        line set as artwork, at 44px inside the 64px strip.
//   - "mark-plus-text" — the icon-plus-wordmark candidate: the simple badge,
//                        with the name beside it as real HTML text that stays
//                        crisp at any size.
//   - "tall-full-mark" — the same full mark, grown to 80px. Only legible inside
//                        a taller strip, which the scene supplies by overriding
//                        `--header-height` on the row: everything that lines up
//                        with the header reads that variable, so the strip, the
//                        nav's vertical centring and the row's own box all
//                        follow with no other change.
export type HeaderBrandRender =
  | "full-mark"
  | "mark-plus-text"
  | "tall-full-mark";

// TEMP: header-nav exploration — strip before merge.
// Fixture overrides the /preview/header-nav scene passes in. The live app never
// passes this, so the header behaves exactly as it did before.
export interface HeaderPreviewOverrides {
  /** Stands in for `usePathname()`, so a scene can put the header on any page. */
  pathname: string;
  /** Which arrangement of the labelled "My SOG" item to render. */
  navOption: HeaderNavOption;
  /**
   * How the brand reads at `sm` and up: the full mark (what ships), or the
   * simple mark with "School of Gaming" set beside it as real text. Below `sm`
   * both render the simple mark alone, so this changes nothing on a phone.
   */
  brandRender?: HeaderBrandRender;
  /**
   * Force the sub-`sm` layout regardless of the real viewport.
   *
   * Tailwind's `sm:` is a *viewport* media query, so a 320px-wide box on a
   * desktop screen still renders the wide forms — the full mark, the locale
   * code beside the flag, the roomier gaps — and a phone frame built that way
   * would be a picture of a layout no phone ever shows. This makes the narrow
   * branch explicit so the frame is the real thing.
   */
  viewport?: "narrow";
}

export function Header({
  preview,
}: {
  preview?: HeaderPreviewOverrides;
} = {}) {
  const livePathname = usePathname();
  // TEMP: header-nav exploration — strip before merge (keep `usePathname()`).
  const pathname = preview?.pathname ?? livePathname;
  // TEMP: header-nav exploration — strip before merge (both lines). `sm()` drops
  // the `sm:` half of a responsive pair when a scene has asked for the narrow
  // layout, so the mobile branch is stated once rather than duplicated.
  const narrow = preview?.viewport === "narrow";
  const sm = (classes: string) => (narrow ? undefined : classes);
  // TEMP: header-nav exploration — strip before merge.
  const brandRender = preview?.brandRender ?? "full-mark";
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

  // TEMP: header-nav exploration — strip before merge (down to `avatarContent`).
  // The labelled way to My SOG, in whichever arrangement the scene asked for.
  // It exists only under a preview override — the live header is untouched until
  // an option is picked and wired for real (which is also when this item earns a
  // `dashboard_nav` method of its own, and when the admin's label — "Dashboard",
  // never "My SOG" — stops being a branch nothing exercises).
  const navOption = preview?.navOption ?? "none";
  const isOnDashboardTarget =
    dashboardPath !== null &&
    (pathname === dashboardPath || pathname.startsWith(dashboardPath + "/"));
  const mySogItem =
    navOption === "none" || !user || !dashboardPath ? null : (
      <Link
        href={dashboardPath}
        className={cn(
          MY_SOG_CLASS[navOption].base,
          isOnDashboardTarget
            ? MY_SOG_CLASS[navOption].active
            : MY_SOG_CLASS[navOption].idle,
        )}
        aria-current={isOnDashboardTarget ? "page" : undefined}
      >
        {profile?.role === "admin" ? c("dashboard") : d("pageTitle")}
      </Link>
    );

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

  // Logo content is shared between the loading (non-clickable span) and
  // resolved (Link) branches — same className on the wrapper, identical inner
  // markup, so no layout shift when one swaps for the other.
  const logoClassName = "flex shrink-0 items-center";
  const logoBody = (
    // The mark carries the brand name as artwork, so nothing is set beside it —
    // "Sogverse" is deliberately not in the header. Two files rather than one
    // responsive SVG: below `sm` the phone has no room for the "SCHOOL OF
    // GAMING" line under the letters, and the simple mark is the same badge
    // with that line dropped, so the badge doesn't change size at the
    // breakpoint. Both carry the true viewBox as width/height, which is what
    // lets `w-auto` reserve the right box before the file lands.
    //
    // The alt is the brand constant, not a message key: this is a name, and a
    // locale translates the copy around a name rather than the name itself.
    // Only one of the two is ever displayed, so assistive tech reads it once.
    //
    // `gap-2` costs nothing in the shipped arrangement: a `display: none` flex
    // item creates no gap, and exactly one of these is ever visible there.
    <span className="flex items-center gap-2">
      <Image
        src={sogLogoSimple}
        alt={SENDER_NAME}
        width={LOGO_INTRINSIC.width}
        height={LOGO_INTRINSIC.height}
        // TEMP: header-nav exploration — the wrapper goes with it, leaving
        // `className="h-9 w-auto sm:hidden"`. In the mark-plus-text brand the
        // simple mark is what desktop shows too, grown to the full mark's 44px
        // so the badge is the same size either way.
        className={cn(
          "h-9 w-auto",
          brandRender === "mark-plus-text" ? sm("sm:h-11") : sm("sm:hidden"),
        )}
        unoptimized
      />
      {brandRender !== "mark-plus-text" ? (
        <Image
          src={sogLogoFull}
          alt={SENDER_NAME}
          width={LOGO_INTRINSIC.width}
          height={LOGO_INTRINSIC.height}
          // TEMP: header-nav exploration — the height branch and the `sm()`
          // wrapper go with it; back to
          // `className="hidden h-11 w-auto sm:block"`. 80px is where the mark's
          // own "SCHOOL OF GAMING" line reaches ~10px and becomes readable —
          // 13% of the badge's height, so 44px puts it at ~6px.
          className={cn(
            "hidden w-auto",
            brandRender === "tall-full-mark" ? "h-20" : "h-11",
            sm("sm:block"),
          )}
          unoptimized
        />
      ) : (
        // TEMP: header-nav exploration — strip before merge (this whole
        // branch). The full mark sets "SCHOOL OF GAMING" at about 13% of the
        // badge's height, so at the 44px a 64px strip allows it renders around
        // 6px — unreadable, and no height that fits the header fixes it. Set as
        // real text it is crisp at any size. `aria-hidden` because the mark
        // beside it already carries the same name as its alt, and a screen
        // reader announcing the brand twice inside one link is noise.
        <span
          aria-hidden
          className={cn(
            "hidden whitespace-nowrap text-base font-semibold text-foreground",
            sm("sm:inline"),
          )}
        >
          {SENDER_NAME}
        </span>
      )}
    </span>
  );

  return (
    <SiteHeaderShell>
      <nav
        // TEMP: header-nav exploration — the `sm()` wrapper goes with it, back
        // to a plain `className="… gap-2 px-3 sm:gap-3 sm:px-4"`.
        className={cn(
          "container mx-auto flex h-full items-center justify-between gap-2 px-3",
          sm("sm:gap-3 sm:px-4"),
        )}
      >
        {isLoading ? (
          // Auth-loading window: hold the logo as inert text so a hurried
          // click can't fire while logoHref hasn't been resolved yet (it
          // would default to "/" and misroute a signed-in parent/gamer
          // away from their dashboard). Same pattern the avatar uses.
          <span className={logoClassName}>{logoBody}</span>
        ) : (
          <Link
            href={logoHref}
            className={logoClassName}
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
        )}

        {/*
          Every link carries its own 44px-tall, `px-2` touch target, and the
          group's `-mx-2` hands that outer padding straight back to the flex
          gaps on either side. So the words sit exactly where they sat: on a
          desktop the group's box is the same width it was (`sm:gap-2` + 8px of
          padding per side is the old `sm:gap-6`), and on a phone only the space
          *between* Shop and Help grows, from 8px to 16px, which is the crowding
          this fixes. The reclaimed 8px means the first link's target abuts the
          logo's rather than overlapping it — a near-miss on the mark lands on
          Shop instead of on nothing, which is the honest trade for the padding.
        */}
        <div
          // TEMP: header-nav exploration — the `sm()` wrapper goes with it,
          // back to `className="-mx-2 flex items-center sm:gap-2"`.
          className={cn("-mx-2 flex items-center", sm("sm:gap-2"))}
        >
          {navOption === "leading-link" && mySogItem}
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
          {navOption === "trailing-pill" && mySogItem}
        </div>

        <div
          // TEMP: header-nav exploration — the `sm()` wrapper goes with it,
          // back to `className="flex shrink-0 items-center gap-2 sm:gap-3"`.
          className={cn("flex shrink-0 items-center gap-2", sm("sm:gap-3"))}
        >
          {navOption === "cluster-pill" && mySogItem}
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
          {/* TEMP: header-nav exploration — the prop goes with it, back to a
              bare `<LocalePicker />`. */}
          <LocalePicker narrow={narrow} />
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
      </nav>
    </SiteHeaderShell>
  );
}
