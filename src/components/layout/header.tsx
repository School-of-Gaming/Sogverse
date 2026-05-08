"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { UnknownAvatar } from "@/components/ui/unknown-avatar";
import { useAuth } from "@/providers";
import { cn } from "@/lib/utils";
import { ROLE_DASHBOARD_PATHS, ROUTES } from "@/lib/constants";
import { LocalePicker } from "@/components/layout/locale-picker";

// Dashboard route prefixes the avatar's "active" ring tracks against. When the
// user is anywhere under one of these, the avatar gets a primary-color ring —
// the same role SOG's drop-shadow plays for the home page.
const DASHBOARD_PREFIXES = ["/admin", "/parent", "/gamer", "/gedu"];

export function Header() {
  const pathname = usePathname();
  const { user, profile, isLoading } = useAuth();
  const t = useTranslations("header");
  const c = useTranslations("common");

  const navLinks = [
    { href: ROUTES.products, label: t("nav.clubs") },
    { href: ROUTES.camps, label: t("nav.camps") },
    { href: ROUTES.events, label: t("nav.events") },
  ];

  const isHome = pathname === ROUTES.home;
  const isOnDashboard = DASHBOARD_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  const dashboardPath = profile?.role
    ? ROLE_DASHBOARD_PATHS[profile.role]
    : null;

  // While auth is resolving we don't yet know where the avatar should link, so
  // the slot stays non-interactive (a span, not a Link). Once known, signed-in
  // users go to their dashboard, signed-out users go to login.
  const avatarHref = isLoading
    ? null
    : user && dashboardPath
      ? dashboardPath
      : ROUTES.login;

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
        isOnDashboard && "ring-2 ring-primary",
      )}
    >
      {avatarContent}
    </Avatar>
  );

  return (
    <header className="fixed top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <nav className="container mx-auto flex h-16 items-center justify-between gap-2 px-3 sm:gap-3 sm:px-4">
        <Link
          href={ROUTES.home}
          className="flex shrink-0 items-center gap-2"
          aria-current={isHome ? "page" : undefined}
        >
          <span
            className={cn(
              "font-display text-xl font-bold text-primary transition-all duration-300",
              isHome && "drop-shadow-[0_0_12px_currentColor]",
            )}
          >
            SOG
          </span>
          <span className="hidden text-lg font-semibold sm:inline-block">
            {c("appName")}
          </span>
        </Link>

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
          <LocalePicker />
          {avatarHref ? (
            <Link
              href={avatarHref}
              aria-label={user ? c("dashboard") : c("signIn")}
              aria-current={isOnDashboard ? "page" : undefined}
              className="rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {avatarFrame}
            </Link>
          ) : (
            <span className="rounded-md">{avatarFrame}</span>
          )}
        </div>
      </nav>
    </header>
  );
}
