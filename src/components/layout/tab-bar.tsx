"use client";

import type { ComponentProps, ReactNode } from "react";
import { House } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  PublicDestinationLink,
  usePublicDestinations,
} from "@/components/layout/public-nav";

/**
 * The first tab: the reader's home, which is where the header's logo goes —
 * the home page signed out, the role's dashboard signed in, under the name the
 * header gives it. One icon in both states, since it is one slot meaning one
 * thing; only the label changes.
 */
export interface FirstTab {
  href: ComponentProps<typeof Link>["href"];
  label: string;
  isActive: boolean;
  onClick?: () => void;
}

const TAB_CLASS =
  "flex h-full min-w-0 flex-col items-center justify-center gap-0.5 px-1 transition-colors hover:text-act";

function TabBody({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <>
      <Icon className="h-5 w-5 shrink-0" aria-hidden />
      {/* `truncate` rather than a wrap: at 360px a tab is 72px wide, and a word
          that does not fit (the admin's "Dashboard" in French or Finnish) ends
          in an ellipsis on one line. The text node is still the whole word, so
          the link's accessible name is too. */}
      <span className="max-w-full truncate text-[11px] font-medium leading-tight">
        {label}
      </span>
    </>
  );
}

function Tab({ children }: { children: ReactNode }) {
  return <li className="min-w-0">{children}</li>;
}

/**
 * The phone navigation: a fixed bar along the bottom of the viewport, below
 * `md`, on every page that shows the site header — the header renders it.
 *
 * Five equal cells, so the only thing auth can change is the first cell's word:
 * Home while the server saw no session, the dashboard's name once it knows
 * whose it is. Its icon and the other four cells never change.
 *
 * `z-40`: under the header and its menus, under every dialog and sheet portal,
 * and under the cookie strip (`z-50`), which covers it while it is up. Its
 * height is `--tab-bar-height`, which `globals.css` also pays as bottom padding
 * on whatever contains it, so the end of the page is never hidden behind it.
 */
export function TabBar({
  pathname,
  first,
}: {
  pathname: string;
  first: FirstTab;
}) {
  const t = useTranslations("header");
  const destinations = usePublicDestinations(pathname);

  return (
    <nav
      data-tab-bar=""
      aria-label={t("nav.tabBar")}
      className="glass fixed inset-x-0 bottom-0 z-40 h-[var(--tab-bar-height)] border-t border-border pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid h-full grid-cols-5">
        <Tab>
          <Link
            href={first.href}
            onClick={first.onClick}
            aria-current={first.isActive ? "page" : undefined}
            className={cn(
              TAB_CLASS,
              first.isActive ? "text-act" : "text-muted-foreground",
            )}
          >
            <TabBody icon={House} label={first.label} />
          </Link>
        </Tab>
        {destinations.map((destination) => (
          <Tab key={destination.key}>
            <PublicDestinationLink
              destination={destination}
              className={cn(
                TAB_CLASS,
                destination.isActive ? "text-act" : "text-muted-foreground",
              )}
            >
              <TabBody icon={destination.icon} label={destination.label} />
            </PublicDestinationLink>
          </Tab>
        ))}
      </ul>
    </nav>
  );
}
