"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Package,
  Palette,
  Settings,
  Gamepad2,
  Coins,
  FlaskConical,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers";
import { ROUTES, ROLE_BADGES } from "@/lib/constants";
import type { UserRole } from "@/types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const navItemsByRole: Record<UserRole, NavItem[]> = {
  admin: [
    {
      href: ROUTES.admin.dashboard,
      label: "Dashboard",
      icon: <LayoutDashboard className="h-5 w-5" />,
    },
    { href: ROUTES.admin.users, label: "Users", icon: <Users className="h-5 w-5" /> },
    {
      href: ROUTES.admin.products,
      label: "Products",
      icon: <Package className="h-5 w-5" />,
    },
    {
      href: ROUTES.admin.groups,
      label: "Groups",
      icon: <Users className="h-5 w-5" />,
    },
    {
      href: ROUTES.admin.uiComponents,
      label: "UI Components",
      icon: <Palette className="h-5 w-5" />,
    },
    {
      href: ROUTES.admin.testing,
      label: "Testing",
      icon: <FlaskConical className="h-5 w-5" />,
    },
    {
      href: ROUTES.feedback,
      label: "Feedback",
      icon: <MessageSquare className="h-5 w-5" />,
    },
    {
      href: ROUTES.settings,
      label: "Settings",
      icon: <Settings className="h-5 w-5" />,
    },
  ],
  customer: [
    {
      href: ROUTES.customer.dashboard,
      label: "Dashboard",
      icon: <LayoutDashboard className="h-5 w-5" />,
    },
    {
      href: ROUTES.customer.sorg,
      label: "Sorg",
      icon: <Coins className="h-5 w-5" />,
    },
    {
      href: ROUTES.customer.gamers,
      label: "My Gamers",
      icon: <Gamepad2 className="h-5 w-5" />,
    },
    {
      href: ROUTES.feedback,
      label: "Feedback",
      icon: <MessageSquare className="h-5 w-5" />,
    },
    {
      href: ROUTES.settings,
      label: "Settings",
      icon: <Settings className="h-5 w-5" />,
    },
  ],
  gamer: [
    {
      href: ROUTES.gamer.dashboard,
      label: "Home",
      icon: <LayoutDashboard className="h-5 w-5" />,
    },
    {
      href: ROUTES.gamer.groups,
      label: "My Groups",
      icon: <Users className="h-5 w-5" />,
    },
    {
      href: ROUTES.feedback,
      label: "Feedback",
      icon: <MessageSquare className="h-5 w-5" />,
    },
    {
      href: ROUTES.settings,
      label: "Settings",
      icon: <Settings className="h-5 w-5" />,
    },
  ],
  gedu: [
    {
      href: ROUTES.gedu.dashboard,
      label: "Dashboard",
      icon: <LayoutDashboard className="h-5 w-5" />,
    },
    {
      href: ROUTES.gedu.groups,
      label: "Groups",
      icon: <Users className="h-5 w-5" />,
    },
    {
      href: ROUTES.feedback,
      label: "Feedback",
      icon: <MessageSquare className="h-5 w-5" />,
    },
    {
      href: ROUTES.settings,
      label: "Settings",
      icon: <Settings className="h-5 w-5" />,
    },
  ],
};

export function Sidebar() {
  const pathname = usePathname();
  const { profile } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  if (!profile?.role) return null;

  const navItems = navItemsByRole[profile.role];
  const collapseTransition = "[transition:width_700ms,padding_700ms,gap_700ms,max-width_700ms,opacity_700ms]";
  const navTransition = "[transition:padding_700ms,gap_700ms,background-color_300ms,color_300ms]";

  return (
    <aside
      className={cn(
        `relative flex h-full flex-col border-r border-sidebar-border bg-sidebar-background ${collapseTransition}`,
        collapsed ? "w-18" : "w-18 md:w-64"
      )}
    >
      {/* Collapse Toggle — desktop only, mobile is always icon-only via CSS */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-6 z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-sidebar-border bg-sidebar-background text-sidebar-foreground shadow-sm hover:bg-sidebar-accent md:flex"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
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
              title={item.label}
            >
              <span className="shrink-0">{item.icon}</span>
              <span
                className={cn(
                  `overflow-hidden text-ellipsis ${collapseTransition}`,
                  collapsed ? "max-w-0 opacity-0" : "max-w-0 opacity-0 md:max-w-48 md:opacity-100"
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* User Info */}
      <div className="overflow-hidden border-t border-sidebar-border p-4">
        <div className="whitespace-nowrap text-sm">
          <p className="overflow-hidden text-ellipsis font-medium text-sidebar-foreground">
            {profile.display_name}
          </p>
          <p className="overflow-hidden text-ellipsis text-xs text-muted-foreground">
            {ROLE_BADGES[profile.role].label}
          </p>
        </div>
      </div>
    </aside>
  );
}
