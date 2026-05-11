"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  UsersRound,
  AudioLines,
  Palette,
  Settings,
  Gamepad2,
  FlaskConical,
  MessageCircle,
  MessageSquare,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Joystick,
  School,
  Tent,
  CalendarDays,
} from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers";
import { ROLE_LABEL_KEYS, ROUTES } from "@/lib/constants";
import type { UserRole } from "@/types";

type SidebarKey =
  | "dashboard" | "users" | "groups" | "locations"
  | "uiComponents" | "whatsapp" | "testing" | "feedback" | "settings"
  | "myGamers" | "home" | "myGroups" | "voice"
  | "consumerClubs" | "municipalityClubs" | "camps" | "events";

interface NavItemDef {
  href: string;
  labelKey: SidebarKey;
  icon: React.ReactNode;
}

const navItemsByRole: Record<UserRole, NavItemDef[]> = {
  admin: [
    { href: ROUTES.admin.dashboard, labelKey: "dashboard", icon: <LayoutDashboard className="h-5 w-5" /> },
    { href: ROUTES.admin.users, labelKey: "users", icon: <Users className="h-5 w-5" /> },
    { href: ROUTES.admin.consumerClubs, labelKey: "consumerClubs", icon: <Joystick className="h-5 w-5" /> },
    { href: ROUTES.admin.municipalityClubs, labelKey: "municipalityClubs", icon: <School className="h-5 w-5" /> },
    { href: ROUTES.admin.camps, labelKey: "camps", icon: <Tent className="h-5 w-5" /> },
    { href: ROUTES.admin.events, labelKey: "events", icon: <CalendarDays className="h-5 w-5" /> },
    { href: ROUTES.admin.voice, labelKey: "voice", icon: <AudioLines className="h-5 w-5" /> },
    { href: ROUTES.admin.groups, labelKey: "groups", icon: <UsersRound className="h-5 w-5" /> },
    { href: ROUTES.admin.locations, labelKey: "locations", icon: <MapPin className="h-5 w-5" /> },
    { href: ROUTES.admin.uiComponents, labelKey: "uiComponents", icon: <Palette className="h-5 w-5" /> },
    { href: ROUTES.admin.whatsapp, labelKey: "whatsapp", icon: <MessageCircle className="h-5 w-5" /> },
    { href: ROUTES.admin.testing, labelKey: "testing", icon: <FlaskConical className="h-5 w-5" /> },
    { href: ROUTES.feedback, labelKey: "feedback", icon: <MessageSquare className="h-5 w-5" /> },
    { href: ROUTES.settings, labelKey: "settings", icon: <Settings className="h-5 w-5" /> },
  ],
  customer: [
    { href: ROUTES.customer.dashboard, labelKey: "dashboard", icon: <LayoutDashboard className="h-5 w-5" /> },
    { href: ROUTES.customer.gamers, labelKey: "myGamers", icon: <Gamepad2 className="h-5 w-5" /> },
    { href: ROUTES.feedback, labelKey: "feedback", icon: <MessageSquare className="h-5 w-5" /> },
    { href: ROUTES.settings, labelKey: "settings", icon: <Settings className="h-5 w-5" /> },
  ],
  gamer: [
    { href: ROUTES.gamer.dashboard, labelKey: "home", icon: <LayoutDashboard className="h-5 w-5" /> },
    { href: ROUTES.gamer.groups, labelKey: "myGroups", icon: <UsersRound className="h-5 w-5" /> },
    { href: ROUTES.feedback, labelKey: "feedback", icon: <MessageSquare className="h-5 w-5" /> },
    { href: ROUTES.settings, labelKey: "settings", icon: <Settings className="h-5 w-5" /> },
  ],
  gedu: [
    { href: ROUTES.gedu.dashboard, labelKey: "dashboard", icon: <LayoutDashboard className="h-5 w-5" /> },
    { href: ROUTES.gedu.voice, labelKey: "voice", icon: <AudioLines className="h-5 w-5" /> },
    { href: ROUTES.gedu.groups, labelKey: "groups", icon: <UsersRound className="h-5 w-5" /> },
    { href: ROUTES.feedback, labelKey: "feedback", icon: <MessageSquare className="h-5 w-5" /> },
    { href: ROUTES.settings, labelKey: "settings", icon: <Settings className="h-5 w-5" /> },
  ],
};

export function Sidebar() {
  const pathname = usePathname();
  const { profile } = useAuth();
  const t = useTranslations('sidebar');
  const c = useTranslations('common');
  const [collapsed, setCollapsed] = useState(false);

  if (!profile?.role) return null;

  const navItems = navItemsByRole[profile.role];
  const collapseTransition = "[transition:width_700ms,padding_700ms,gap_700ms,max-width_700ms,opacity_700ms]";
  const navTransition = "[transition:padding_700ms,gap_700ms,background-color_300ms,color_300ms]";

  return (
    <aside
      className={cn(
        // Sticks to the bottom edge of the sticky Header by reading
        // `--header-height` from `globals.css` — the same variable the
        // header itself uses. Height is pinned to the visible viewport
        // below the header so the user-info section stays anchored to the
        // bottom while the dashboard <main> scrolls with the document.
        `sticky top-[var(--header-height)] flex h-[calc(100vh-var(--header-height))] flex-col self-start border-r border-sidebar-border bg-sidebar-background ${collapseTransition}`,
        collapsed ? "w-18" : "w-18 md:w-64"
      )}
    >
      {/* Collapse Toggle — desktop only, mobile is always icon-only via CSS */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-6 z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-sidebar-border bg-sidebar-background text-sidebar-foreground shadow-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:flex"
        aria-label={collapsed ? t('expandSidebar') : t('collapseSidebar')}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-hidden p-4">
        {navItems.map((item) => {
          const label = t(item.labelKey);
          const isActive =
            pathname === item.href ||
            (item.href !== ROUTES.admin.dashboard &&
              item.href !== ROUTES.customer.dashboard &&
              item.href !== ROUTES.gamer.dashboard &&
              item.href !== ROUTES.gedu.dashboard &&
              pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                `flex items-center overflow-hidden whitespace-nowrap rounded-lg py-2 text-sm font-medium ${navTransition}`,
                collapsed ? "gap-0 px-2.5" : "gap-0 px-2.5 md:gap-3 md:px-3",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
              title={label}
            >
              <span className="shrink-0">{item.icon}</span>
              <span
                className={cn(
                  `overflow-hidden text-ellipsis ${collapseTransition}`,
                  collapsed ? "max-w-0 opacity-0" : "max-w-0 opacity-0 md:max-w-48 md:opacity-100"
                )}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* User Info */}
      <div className="overflow-hidden border-t border-sidebar-border p-4">
        <div className="whitespace-nowrap text-sm">
          <p className="overflow-hidden text-ellipsis font-medium text-sidebar-foreground">
            {profile.first_name}
          </p>
          <p className="overflow-hidden text-ellipsis text-xs text-muted-foreground">
            {c(ROLE_LABEL_KEYS[profile.role])}
          </p>
        </div>
      </div>
    </aside>
  );
}
