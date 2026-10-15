"use client";

import { Link, usePathname } from "@/i18n/navigation";
import type { StaticAppHref } from "@/lib/constants/routes";
import { cn } from "@/lib/utils";

export interface HubTab {
  href: StaticAppHref;
  label: string;
}

/**
 * The tab strip across the top of a hub — several pages that share one rail
 * entry, each reached from the strip.
 *
 * **Navigation, not an ARIA tablist.** Every tab is a link to its own URL, so
 * the browser's back button, a middle-click and a pasted address all work, and
 * the current one is marked `aria-current="page"`. The strip is a `nav` named by
 * `label`.
 *
 * The current tab is the one whose href is the page's internal pathname,
 * exactly: the strip belongs on the hub's own pages, not on the pages beneath
 * them. Every tab sets the same weight whether current or not, so moving
 * between tabs never changes a label's width and nothing in the strip shifts.
 * At narrow widths the strip wraps rather than scrolling the document.
 */
export function HubTabs({
  tabs,
  label,
}: {
  tabs: readonly HubTab[];
  /** The strip's accessible name — usually the hub's title. */
  label: string;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((tab) => {
          const current = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex whitespace-nowrap rounded-t-md border-b-2 px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act",
                  current
                    ? "border-act text-act"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
