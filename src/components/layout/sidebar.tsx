"use client";

import { Link } from "@/i18n/navigation";
import { usePathname } from "@/i18n/navigation";
import {
  LayoutDashboard,
  Users,
  Palette,
  MonitorPlay,
  Settings,
  FlaskConical,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers";
import { ROLE_LABEL_KEYS, ROUTES } from "@/lib/constants";
import { PRODUCT_TYPE_PRESENTATION } from "@/components/admin/dashboard/product-type-presentation";
import type { ProductType, UserRole } from "@/types";
import type { StaticAppHref } from "@/lib/constants/routes";

type SidebarKey =
  | "dashboard" | "users"
  | "uiComponents" | "uiPreviews" | "whatsapp" | "testing" | "settings"
  | "tools" | "consumerClubs" | "municipalityClubs" | "camps" | "events"
  | "sites";

interface NavItemDef {
  href: StaticAppHref;
  labelKey: SidebarKey;
  icon: React.ReactNode;
}

/**
 * The rail's glyph for a product kind, read from the one table that owns it.
 *
 * A kind's glyph is a fact the library's tone grammar decides, not a choice
 * this file makes: the four entries below used to spell their own lucide
 * icons, which agreed with the grammar only by coincidence and drifted the
 * moment the grammar picked a different mark. The rail takes the glyph
 * uninked — the sidebar is chrome and composes from the neutrals, so the
 * family's colour stays with the surfaces that key on it.
 */
function kindIcon(kind: ProductType) {
  const Icon = PRODUCT_TYPE_PRESENTATION[kind].icon;
  return <Icon className="h-5 w-5" />;
}

// Only admin renders the sidebar (see DashboardRootLayout). Parents, gamers,
// and gedus get to their dashboards via the SOG logo in the header and have
// no nested sub-routes that need sidebar nav.
const navItemsByRole: Partial<Record<UserRole, NavItemDef[]>> = {
  admin: [
    { href: ROUTES.admin.dashboard, labelKey: "dashboard", icon: <LayoutDashboard className="h-5 w-5" /> },
    { href: ROUTES.admin.users, labelKey: "users", icon: <Users className="h-5 w-5" /> },
    { href: ROUTES.admin.consumerClubs, labelKey: "consumerClubs", icon: kindIcon("consumer_club") },
    { href: ROUTES.admin.municipalityClubs, labelKey: "municipalityClubs", icon: kindIcon("municipality_club") },
    { href: ROUTES.admin.camps, labelKey: "camps", icon: kindIcon("camp") },
    { href: ROUTES.admin.events, labelKey: "events", icon: kindIcon("event") },
    { href: ROUTES.admin.sites, labelKey: "sites", icon: <MapPin className="h-5 w-5" /> },
    { href: ROUTES.admin.tools, labelKey: "tools", icon: <Wrench className="h-5 w-5" /> },
    { href: ROUTES.admin.uiComponents, labelKey: "uiComponents", icon: <Palette className="h-5 w-5" /> },
    { href: ROUTES.admin.uiPreviews, labelKey: "uiPreviews", icon: <MonitorPlay className="h-5 w-5" /> },
    { href: ROUTES.admin.whatsapp, labelKey: "whatsapp", icon: <MessageCircle className="h-5 w-5" /> },
    { href: ROUTES.admin.testing, labelKey: "testing", icon: <FlaskConical className="h-5 w-5" /> },
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
  if (!navItems) return null;
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
        //
        // The rail has no palette of its own: it is chrome, and composes from
        // the general neutrals like every other surface. Its ground is the
        // card, its edge the general border, its hover fill `muted`, and the
        // active entry the brand pair.
        `sticky top-[var(--header-height)] flex h-[calc(100vh-var(--header-height))] flex-col self-start border-r border-border bg-card ${collapseTransition}`,
        collapsed ? "w-18" : "w-18 md:w-64"
      )}
    >
      {/* Collapse Toggle — desktop only, mobile is always icon-only via CSS */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-6 z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm hover:bg-hover md:flex"
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
              pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                `flex items-center overflow-hidden whitespace-nowrap rounded-lg py-2 text-sm font-medium ${navTransition}`,
                collapsed ? "gap-0 px-2.5" : "gap-0 px-2.5 md:gap-3 md:px-3",
                isActive
                  ? "bg-act text-act-foreground"
                  : "text-foreground hover:bg-hover"
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
      <div className="overflow-hidden border-t border-border p-4">
        <div className="whitespace-nowrap text-sm">
          <p className="overflow-hidden text-ellipsis font-medium text-foreground">
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
