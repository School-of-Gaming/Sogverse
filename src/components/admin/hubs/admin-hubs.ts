import { ROUTES } from "@/lib/constants";
import type { StaticAppHref } from "@/lib/constants/routes";

/**
 * The admin hubs: one rail entry that opens a page with tabs across its top.
 *
 * **This table is the only place a hub is declared.** The tab strip draws its
 * tabs from it and the rail lights the hub's entry from it, so a page added to
 * a hub here gets both at once — and a page cannot be one of a hub's tabs while
 * leaving the rail entry dark.
 *
 * A hub's first tab is where its rail entry goes. `alsoCovers` names pages that
 * belong to the hub without being a tab of it — a product's detail, edit and
 * create pages sit under one path per product type, and they light the products
 * entry so a reader deep in a club still sees where they are.
 */
export const ADMIN_HUBS = {
  products: {
    tabs: [
      { id: "products", href: ROUTES.admin.products },
      { id: "sites", href: ROUTES.admin.sites },
      { id: "holidayCalendars", href: ROUTES.admin.holidayCalendars },
    ],
    alsoCovers: [
      "/admin/consumer-clubs",
      "/admin/municipality-clubs",
      "/admin/camps",
      "/admin/events",
    ],
  },
  invoicing: {
    tabs: [
      { id: "municipalities", href: ROUTES.admin.municipalityInvoicing },
      { id: "invoiceCustomers", href: ROUTES.admin.invoiceCustomers },
      { id: "gedus", href: ROUTES.admin.geduInvoicing },
    ],
    alsoCovers: [],
  },
  // What the public site says to win families: the landing pages, the
  // testimonials the site quotes, and the spotlights the session report
  // emails carry. Each tab's detail, new and edit pages sit beneath its own
  // path, so its prefix already lights the entry there.
  marketing: {
    tabs: [
      { id: "landingPages", href: ROUTES.admin.landingPages },
      { id: "testimonials", href: ROUTES.admin.testimonials },
      { id: "spotlights", href: ROUTES.admin.spotlights },
    ],
    alsoCovers: [],
  },
} as const satisfies Record<
  string,
  {
    tabs: readonly { id: string; href: StaticAppHref }[];
    alsoCovers: readonly StaticAppHref[];
  }
>;

export type AdminHubId = keyof typeof ADMIN_HUBS;

/** A tab's id, which is also its label's key under `adminHubs.tabs`. */
export type AdminHubTabId =
  (typeof ADMIN_HUBS)[AdminHubId]["tabs"][number]["id"];

/** Every hub, in rail order. */
export const ADMIN_HUB_IDS: readonly AdminHubId[] = ["products", "invoicing", "marketing"];

/**
 * Whether `pathname` is `prefix` or a page beneath it. A segment boundary, so
 * `/admin/sites` does not claim a sibling that merely starts with the same
 * letters.
 */
export function isAtOrBeneath(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

/** The path prefixes a hub's rail entry lights on: its tabs, then the rest. */
export function adminHubPrefixes(hub: AdminHubId): readonly StaticAppHref[] {
  const { tabs, alsoCovers } = ADMIN_HUBS[hub];
  return [...tabs.map((tab) => tab.href), ...alsoCovers];
}

/**
 * The hub a page belongs to, or `null`. The pathname is the locale-stripped
 * internal one the wrapped `usePathname` returns.
 */
export function adminHubForPathname(pathname: string): AdminHubId | null {
  return (
    ADMIN_HUB_IDS.find((hub) =>
      adminHubPrefixes(hub).some((prefix) => isAtOrBeneath(pathname, prefix)),
    ) ?? null
  );
}
