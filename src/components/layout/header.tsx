"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Settings } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { UnknownAvatar } from "@/components/ui/unknown-avatar";
import { useAuth } from "@/providers";
import { cn } from "@/lib/utils";
import { ROLE_DASHBOARD_PATHS, ROUTES, type UserRole } from "@/lib/constants";
import { LocalePicker } from "@/components/layout/locale-picker";
import { SiteHeaderShell } from "@/components/layout/site-header-shell";

// Dashboard route prefixes used to detect whether the user is currently on a
// dashboard. Used both for the avatar's active-ring state (admin/gedu — whose
// avatar links to the dashboard) and the logo's drop-shadow (parent/gamer —
// whose logo links to the dashboard).
const DASHBOARD_PREFIXES = ["/admin", "/parent", "/gamer", "/gedu"];

// Roles whose header avatar routes to the family profile selector instead of
// their dashboard. Parents and gamers share one household, so the avatar is
// the "switch to another family member" affordance for both; the SOG logo
// takes those roles to their dashboard instead.
const SELECTOR_ROLES = new Set<UserRole>(["customer", "gamer"]);

export function Header() {
  const pathname = usePathname();
  const { user, profile, isLoading } = useAuth();
  const t = useTranslations("header");
  const c = useTranslations("common");

  // While the storefront is being built, the navbar surfaces a single Shop
  // entry instead of separate Clubs / Camps / Events links. The direct routes
  // (ROUTES.clubs, ROUTES.camps, ROUTES.events) still resolve for anyone
  // who has the URL — they're just not in the top nav for now.
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

  // Logo destination: parents/gamers go to their dashboard (the household has
  // an interstitial in front of the dashboard, and the logo is their direct
  // route past it). Everyone else — including signed-out visitors — goes
  // home.
  const logoHref =
    user && usesSelector && dashboardPath ? dashboardPath : ROUTES.home;
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
  const logoClassName = "flex shrink-0 items-center gap-2";
  const logoBody = (
    <>
      <span
        className={cn(
          "font-display text-xl font-bold text-primary transition-all duration-300",
          isOnLogoTarget && "drop-shadow-[0_0_12px_currentColor]",
        )}
      >
        SOG
      </span>
      <span className="hidden text-lg font-semibold sm:inline-block">
        {c("appName")}
      </span>
    </>
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
