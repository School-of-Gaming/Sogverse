"use client";

import { Link } from "@/i18n/navigation";
import { usePathname } from "@/i18n/navigation";
import {
  ArrowLeftRight,
  House,
  Users,
  Palette,
  MonitorPlay,
  FlaskConical,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Megaphone,
  MessageSquareHeart,
  Receipt,
  Sparkles,
  Spotlight,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers";
import { ROLE_LABEL_KEYS, ROUTES } from "@/lib/constants";
import { adminHubPrefixes, isAtOrBeneath } from "@/components/admin/hubs/admin-hubs";
import type { UserRole } from "@/types";
import type { StaticAppHref } from "@/lib/constants/routes";

type SidebarKey =
  | "dashboard" | "users"
  | "uiComponents" | "uiPreviews" | "testing"
  | "tools" | "products" | "invoicing"
  | "libraryContent" | "spotlights" | "landingPages" | "platformVision"
  | "substitutions" | "feedback";

interface NavItemDef {
  href: StaticAppHref;
  labelKey: SidebarKey;
  icon: React.ReactNode;
  /**
   * The paths this entry is lit on, each with every page beneath it. Given, it
   * replaces matching on the entry's own href; a hub entry takes its list from
   * the hub definition, which is what keeps it lit on every tab of the hub.
   */
  matches?: readonly string[];
}

// Only admin renders the sidebar (see DashboardRootLayout). Parents, gamers,
// and gedus get to their dashboards via the SOG logo in the header and have
// no nested sub-routes that need sidebar nav.
const navItemsByRole: Partial<Record<UserRole, NavItemDef[]>> = {
  admin: [
    { href: ROUTES.admin.dashboard, labelKey: "dashboard", icon: <House className="h-5 w-5" /> },
    { href: ROUTES.admin.users, labelKey: "users", icon: <Users className="h-5 w-5" /> },
    // Above the catalogue because it is the one page here that is a queue of
    // work: a session with nobody teaching it is answered today, and the clubs
    // are answered whenever.
    { href: ROUTES.admin.substitutions, labelKey: "substitutions", icon: <ArrowLeftRight className="h-5 w-5" /> },
    // Beside the queue rather than among the reports: it is the read of how
    // sessions are landing, and a note that needs acting on is today's work too.
    { href: ROUTES.admin.feedback, labelKey: "feedback", icon: <MessageSquareHeart className="h-5 w-5" /> },
    // One entry for the whole catalogue: the product list, and the sites and
    // holiday calendars clubs are built from, as tabs of one hub. It stays lit
    // on every page beneath a product, so a reader deep in one club still sees
    // where they are.
    {
      href: ROUTES.admin.products,
      labelKey: "products",
      icon: <LayoutGrid className="h-5 w-5" />,
      matches: adminHubPrefixes("products"),
    },
    // The month's money in one hub, under the catalogue it bills for: what each
    // municipality owes, the customers its invoices are addressed to, and what
    // each gedu invoices us for.
    {
      href: ROUTES.admin.municipalityInvoicing,
      labelKey: "invoicing",
      icon: <Receipt className="h-5 w-5" />,
      matches: adminHubPrefixes("invoicing"),
    },
    { href: ROUTES.admin.library, labelKey: "libraryContent", icon: <BookOpen className="h-5 w-5" /> },
    { href: ROUTES.admin.spotlights, labelKey: "spotlights", icon: <Spotlight className="h-5 w-5" /> },
    { href: ROUTES.admin.landingPages, labelKey: "landingPages", icon: <Megaphone className="h-5 w-5" /> },
    // Last of the content entries and above the tooling: it is read, not
    // worked in, and an admin reaches it from a link far more than by habit.
    { href: ROUTES.admin.platformVision, labelKey: "platformVision", icon: <Sparkles className="h-5 w-5" /> },
    { href: ROUTES.admin.tools, labelKey: "tools", icon: <Wrench className="h-5 w-5" /> },
    { href: ROUTES.admin.uiComponents, labelKey: "uiComponents", icon: <Palette className="h-5 w-5" /> },
    { href: ROUTES.admin.uiPreviews, labelKey: "uiPreviews", icon: <MonitorPlay className="h-5 w-5" /> },
    { href: ROUTES.admin.testing, labelKey: "testing", icon: <FlaskConical className="h-5 w-5" /> },
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
        // between the header and the mobile tab bar (`--tab-bar-height`, zero
        // from `lg` up) so the user-info section stays anchored to the
        // bottom, never behind the bar, while the dashboard <main> scrolls with the document.
        //
        // The rail has no palette of its own: it is chrome, and composes from
        // the general neutrals like every other surface. Its ground is the
        // card, its edge the general border, its hover fill `muted`, and the
        // active entry the brand pair.
        `sticky top-[var(--header-height)] flex h-[calc(100vh-var(--header-height)-var(--tab-bar-height))] flex-col self-start border-r border-border bg-card ${collapseTransition}`,
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
          const isActive = item.matches
            ? item.matches.some((prefix) => isAtOrBeneath(pathname, prefix))
            : pathname === item.href ||
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
