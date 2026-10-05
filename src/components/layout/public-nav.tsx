"use client";

import type { ComponentProps, ReactNode } from "react";
import { BookOpen, School, ShoppingBag, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";

type PublicDestinationKey = "shop" | "library" | "team" | "about";

/** The order both surfaces draw the public destinations in. */
const ORDER: PublicDestinationKey[] = ["shop", "library", "team", "about"];

/**
 * One icon per destination, wherever it is drawn. About's is the account
 * menu's: the same place reads as the same place.
 */
const ICONS: Record<PublicDestinationKey, LucideIcon> = {
  shop: ShoppingBag,
  library: BookOpen,
  team: Users,
  about: School,
};

const HREFS = {
  shop: ROUTES.shop,
  library: ROUTES.library,
  team: ROUTES.team,
  about: ROUTES.about,
} as const satisfies Record<PublicDestinationKey, string>;

export interface PublicDestination {
  key: PublicDestinationKey;
  /** The whole word: the strip's label, and the accessible name everywhere. */
  label: string;
  /**
   * The word the tab bar shows. The same as `label` unless a locale's word
   * does not fit a phone tab (French "Bibliothèque"), per the short-label rule
   * in this directory's `CLAUDE.md`.
   */
  shortLabel: string;
  icon: LucideIcon;
  isActive: boolean;
}

/** Whether `pathname` is `href` or a page beneath it. */
export function isAtOrUnder(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * The site's public destinations — Shop, Library, Team, About — as the header
 * strip (from `lg` up) and the tab bar (below it) both draw them. One list, so
 * the two surfaces cannot disagree about order, label or what counts as being
 * there: a destination is current on its page and every page beneath it.
 */
export function usePublicDestinations(pathname: string): PublicDestination[] {
  const t = useTranslations("header");
  const labels: Record<PublicDestinationKey, string> = {
    shop: t("nav.shop"),
    library: t("nav.library"),
    team: t("nav.team"),
    about: t("nav.about"),
  };
  const shortLabels: Record<PublicDestinationKey, string> = {
    ...labels,
    library: t("nav.libraryShort"),
  };
  return ORDER.map((key) => ({
    key,
    label: labels[key],
    shortLabel: shortLabels[key],
    icon: ICONS[key],
    isActive: isAtOrUnder(pathname, HREFS[key]),
  }));
}

type AnchorProps = Omit<ComponentProps<"a">, "href" | "children">;

/** A link to one public destination, marked current when the reader is there. */
export function PublicDestinationLink({
  destination,
  children,
  ...props
}: AnchorProps & { destination: PublicDestination; children: ReactNode }) {
  const shared = {
    ...props,
    "aria-current": destination.isActive ? ("page" as const) : undefined,
  };
  return (
    <Link href={HREFS[destination.key]} {...shared}>
      {children}
    </Link>
  );
}
