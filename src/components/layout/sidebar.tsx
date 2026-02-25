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
  GraduationCap,
  ShoppingBag,
  ClipboardList,
  Coins,
  Mic,
  FlaskConical,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers";
import { ROUTES } from "@/lib/constants";
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
      href: ROUTES.admin.voice,
      label: "Voice Rooms",
      icon: <Mic className="h-5 w-5" />,
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
      href: ROUTES.customer.enrollments,
      label: "Enrollments",
      icon: <ClipboardList className="h-5 w-5" />,
    },
    {
      href: ROUTES.customer.orders,
      label: "Orders",
      icon: <ShoppingBag className="h-5 w-5" />,
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
      href: ROUTES.gamer.games,
      label: "My Games",
      icon: <Gamepad2 className="h-5 w-5" />,
    },
    {
      href: ROUTES.gamer.voice,
      label: "Voice Rooms",
      icon: <Mic className="h-5 w-5" />,
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
      href: ROUTES.gedu.students,
      label: "Students",
      icon: <Users className="h-5 w-5" />,
    },
    {
      href: ROUTES.gedu.courses,
      label: "Courses",
      icon: <GraduationCap className="h-5 w-5" />,
    },
    {
      href: ROUTES.gedu.voice,
      label: "Voice Rooms",
      icon: <Mic className="h-5 w-5" />,
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

  const navItems = navItemsByRole[profile.role] || [];

  return (
    <aside
      className={cn(
        "relative flex h-full flex-col border-r border-sidebar-border bg-sidebar-background transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-6 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-sidebar-border bg-sidebar-background text-sidebar-foreground shadow-sm hover:bg-sidebar-accent"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
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
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                collapsed && "justify-center px-2"
              )}
              title={collapsed ? item.label : undefined}
            >
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User Info */}
      {!collapsed && (
        <div className="border-t border-sidebar-border p-4">
          <div className="text-sm">
            <p className="font-medium text-sidebar-foreground">
              {profile.display_name}
            </p>
            <p className="text-xs capitalize text-muted-foreground">
              {profile.role}
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}
