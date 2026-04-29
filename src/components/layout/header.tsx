"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from 'next-intl';
import { Menu, X, LogOut, Settings, Coins } from "lucide-react";
import { useState, useRef } from "react";
import { useClickOutside } from "@/hooks/use-click-outside";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { useAuth } from "@/providers";
import { useTokenBalance } from "@/services/tokens";
import { cn } from "@/lib/utils";
import { ROLE_DASHBOARD_PATHS, ROLE_LABEL_KEYS, ROUTES } from "@/lib/constants";
import { CurrencyPicker } from "@/components/layout/currency-picker";
import { LocalePicker } from "@/components/layout/locale-picker";

export function Header() {
  const pathname = usePathname();
  const { user, profile, isLoading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const t = useTranslations('header');
  const c = useTranslations('common');

  const publicNavLinks = [
    { href: ROUTES.home, label: t('nav.home') },
    { href: ROUTES.products, label: t('nav.clubs') },
    { href: ROUTES.sorg, label: t('nav.sorg') },
  ];

  const mobileInlineLinks = [
    { href: ROUTES.home, label: t('nav.home') },
    { href: ROUTES.products, label: t('nav.clubs') },
  ];

  const isCustomer = profile?.role === "customer";
  const { data: tokenBalance } = useTokenBalance(
    profile?.id ?? "",
    isCustomer
  );

  const dashboardPath = profile?.role
    ? ROLE_DASHBOARD_PATHS[profile.role]
    : null;

  useClickOutside(dropdownRef, () => setDropdownOpen(false));

  return (
    <header className="fixed top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <nav className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <span className="font-display text-xl font-bold text-primary">
            SOG
          </span>
          <span className="hidden text-lg font-semibold sm:inline-block">
            {c('appName')}
          </span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden items-center gap-6 md:flex">
          {publicNavLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-sm font-medium transition-colors hover:text-primary",
                pathname === link.href
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Auth Section */}
        <div className="hidden items-center gap-4 md:flex">
          {isLoading ? (
            <div className="h-10 w-20 animate-pulse rounded-md bg-muted" />
          ) : user ? (
            <div className="flex items-center gap-4">
              {dashboardPath && (
                <Link href={dashboardPath}>
                  <Button variant="ghost" size="sm" className="cursor-pointer">
                    {c('dashboard')}
                  </Button>
                </Link>
              )}
              <LocalePicker />
              <CurrencyPicker />
              {isCustomer && tokenBalance !== undefined && (
                <Link
                  href={ROUTES.customer.sorg}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-sm font-medium"
                >
                  <Coins className="h-4 w-4 text-primary" />
                  <span>{tokenBalance}</span>
                </Link>
              )}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-2 rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <Avatar className="h-8 w-8">
                    <Identicon id={profile?.id || user.id} size={32} />
                  </Avatar>
                </button>
                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 origin-top-right rounded-md border border-border bg-card py-1 shadow-lg">
                    <div className="px-4 py-2 border-b border-border">
                      <p className="text-sm font-medium">
                        {profile?.display_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {profile?.role ? c(ROLE_LABEL_KEYS[profile.role]) : null}
                      </p>
                    </div>
                    <Link
                      href={ROUTES.settings}
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                    >
                      <Settings className="h-4 w-4" />
                      {c('settings')}
                    </Link>
                    <form action="/api/auth/signout" method="post">
                      <button
                        type="submit"
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-accent hover:text-accent-foreground"
                      >
                        <LogOut className="h-4 w-4" />
                        {c('signOut')}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <LocalePicker />
              <CurrencyPicker />
              <Link href={ROUTES.login}>
                <Button variant="ghost" size="sm">
                  {c('signIn')}
                </Button>
              </Link>
              <Link href={ROUTES.register}>
                <Button size="sm">{c('getStarted')}</Button>
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Inline Navigation */}
        <div className="flex items-center gap-3 md:hidden">
          {mobileInlineLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-sm font-medium transition-colors hover:text-primary",
                pathname === link.href
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={t('toggleMenu')}
        >
          {mobileMenuOpen ? (
            <X className="h-6 w-6" />
          ) : (
            <Menu className="h-6 w-6" />
          )}
        </button>
      </nav>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="border-t border-border md:hidden">
          <div className="container mx-auto space-y-1 px-4 py-4">
            {publicNavLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm font-medium",
                  pathname === link.href
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <hr className="my-2 border-border" />
            {user ? (
              <>
                {dashboardPath && (
                  <Link
                    href={dashboardPath}
                    className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {c('dashboard')}
                  </Link>
                )}
                <div className="flex gap-2 px-3 py-2">
                  <LocalePicker />
                  <CurrencyPicker />
                </div>
                {isCustomer && tokenBalance !== undefined && (
                  <Link
                    href={ROUTES.customer.sorg}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Coins className="h-4 w-4 text-primary" />
                    <span>{t('tokenBalance', { count: tokenBalance })}</span>
                  </Link>
                )}
                <Link
                  href={ROUTES.settings}
                  className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {c('settings')}
                </Link>
                <form action="/api/auth/signout" method="post">
                  <button
                    type="submit"
                    className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-destructive hover:bg-accent hover:text-accent-foreground"
                  >
                    {c('signOut')}
                  </button>
                </form>
              </>
            ) : (
              <>
                <div className="flex gap-2 px-3 py-2">
                  <LocalePicker />
                  <CurrencyPicker />
                </div>
                <Link
                  href={ROUTES.login}
                  className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {c('signIn')}
                </Link>
                <Link
                  href={ROUTES.register}
                  className="block rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {c('getStarted')}
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
