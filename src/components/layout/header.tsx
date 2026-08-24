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

// TEMP: logo-glow exploration — strip before merge.
// Which "you are here" treatment the logo wears when the header is already on
// the page the logo links to. `"none"` is what ships; the rest exist so the
// /preview/logo-glow scene can put them side by side.
export type HeaderLogoTreatment =
  | "none"
  | "tight-glow"
  | "soft-halo"
  | "radial-backdrop"
  | "underline"
  | "chip";

// TEMP: logo-glow exploration — strip before merge.
// The class each treatment adds to the logo's wrapper. Only applied while the
// logo is on its own target — an inactive logo is always bare.
const LOGO_TREATMENT_CLASS: Record<HeaderLogoTreatment, string> = {
  none: "",
  // The shape the old text logo used, aimed at the mark instead: a tight
  // primary-coloured bloom hugging the badge's silhouette.
  "tight-glow": "drop-shadow-[0_0_12px_hsl(var(--primary))]",
  // Same idea, spread wide and dropped in opacity so it reads as light around
  // the badge rather than as the badge being out of focus.
  "soft-halo": "drop-shadow-[0_0_26px_hsl(var(--primary)/0.5)]",
  // Light *behind* the mark rather than bleeding out of it: a radial wash on a
  // layer underneath, so the badge's own edges stay crisp.
  "radial-backdrop":
    "before:absolute before:-inset-x-4 before:-inset-y-3 before:-z-10 before:rounded-full before:bg-[radial-gradient(closest-side,hsl(var(--primary)/0.38),transparent)] before:content-['']",
  // Not a glow at all — the tab-indicator rhyme. The nav links say "here" by
  // turning primary; a mark that is already primary says it with a rule under
  // it instead.
  underline:
    "after:absolute after:inset-x-0 after:-bottom-1.5 after:h-0.5 after:rounded-full after:bg-primary after:content-['']",
  // The other non-glow rhyme: the "current" chip. The plate needs padding to be
  // a plate, and the negative margin gives that padding straight back to the
  // layout — so the mark itself sits in exactly the same place as it does in
  // every other row here, and as it would unlit.
  chip: "-mx-2 px-2 py-1 bg-primary/10 ring-1 ring-primary/30",
};

// TEMP: logo-glow exploration — strip before merge.
// Fixture overrides the /preview/logo-glow scene passes in. The live app never
// passes this, so the header behaves exactly as it did before.
export interface HeaderPreviewOverrides {
  /** Stands in for `usePathname()`, so a scene can put the header on any page. */
  pathname: string;
  /** Which "you are here" treatment to render on the logo. */
  logoTreatment: HeaderLogoTreatment;
}

export function Header({
  preview,
}: {
  preview?: HeaderPreviewOverrides;
} = {}) {
  const livePathname = usePathname();
  // TEMP: logo-glow exploration — strip before merge (keep `usePathname()`).
  const pathname = preview?.pathname ?? livePathname;
  const { user, profile, isLoading } = useAuth();
  const t = useTranslations("header");
  const c = useTranslations("common");

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
  // logo's glow tracks its own.
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
    <span
      className={cn(
        "relative flex items-center rounded-lg transition-all duration-300",
        // TEMP: logo-glow exploration — strip before merge (leaving the two
        // <Image>s and this wrapper behind). The shipped header has no "you are
        // here" treatment on the logo at all — every treatment is opt-in from
        // the preview scene, so this resolves to nothing in the live app.
        isOnLogoTarget &&
          LOGO_TREATMENT_CLASS[preview?.logoTreatment ?? "none"],
      )}
    >
      <Image
        src={sogLogoSimple}
        alt={SENDER_NAME}
        width={LOGO_INTRINSIC.width}
        height={LOGO_INTRINSIC.height}
        className="h-9 w-auto sm:hidden"
        unoptimized
      />
      <Image
        src={sogLogoFull}
        alt={SENDER_NAME}
        width={LOGO_INTRINSIC.width}
        height={LOGO_INTRINSIC.height}
        className="hidden h-11 w-auto sm:block"
        unoptimized
      />
    </span>
  );

  return (
    <SiteHeaderShell>
      <nav className="container mx-auto flex h-full items-center justify-between gap-2 px-3 sm:gap-3 sm:px-4">
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

        <div className="flex items-center gap-2 sm:gap-6">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "text-sm font-medium transition-colors hover:text-primary",
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
      </nav>
    </SiteHeaderShell>
  );
}
