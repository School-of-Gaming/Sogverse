"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LogOut, Settings, User } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/providers";
import { cn } from "@/lib/utils";
import { ROLE_DASHBOARD_PATHS } from "@/lib/constants";

const publicNavLinks = [
  { href: "/", label: "Home" },
  { href: "/products", label: "Products" },
  { href: "/about", label: "About" },
];

export function Header() {
  const pathname = usePathname();
  const { user, profile, signOut, isLoading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const dashboardPath = profile?.role
    ? ROLE_DASHBOARD_PATHS[profile.role]
    : null;

  const getInitials = () => {
    if (profile?.display_name) {
      return profile.display_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    if (profile?.username) {
      return profile.username.slice(0, 2).toUpperCase();
    }
    return "U";
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <nav className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <span className="font-display text-xl font-bold text-primary">
            SOG
          </span>
          <span className="hidden text-lg font-semibold sm:inline-block">
            Sogverse
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
                  <Button variant="ghost" size="sm">
                    Dashboard
                  </Button>
                </Link>
              )}
              <div className="relative group">
                <button className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-ring">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={profile?.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {getInitials()}
                    </AvatarFallback>
                  </Avatar>
                </button>
                <div className="absolute right-0 mt-2 w-48 origin-top-right rounded-md border border-border bg-card py-1 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                  <div className="px-4 py-2 border-b border-border">
                    <p className="text-sm font-medium">
                      {profile?.display_name || profile?.username}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {profile?.role}
                    </p>
                  </div>
                  <Link
                    href="/settings"
                    className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-accent"
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>
                  <button
                    onClick={signOut}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-accent"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  Sign In
                </Button>
              </Link>
              <Link href="/register">
                <Button size="sm">Get Started</Button>
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
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
                    ? "bg-accent text-primary"
                    : "text-muted-foreground hover:bg-accent"
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
                    className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Dashboard
                  </Link>
                )}
                <Link
                  href="/settings"
                  className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Settings
                </Link>
                <button
                  onClick={() => {
                    signOut();
                    setMobileMenuOpen(false);
                  }}
                  className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-destructive hover:bg-accent"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="block rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
