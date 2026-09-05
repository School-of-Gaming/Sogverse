"use client";

import { useEffect, useState } from "react";
import { scrollToAnchor } from "@/lib/navigation/scroll-to-anchor";
import { cn } from "@/lib/utils";

export interface DashboardSection {
  id: string;
  label: string;
  /**
   * Cap this entry's width and ellipsise what doesn't fit.
   *
   * Off by default, and it has to be: a *translated* label that runs long is a
   * copy problem, and silently truncating it hides the problem rather than
   * fixing it — the answer there is a shorter string for that locale. The flag
   * exists for the one case where no shorter string can be written, which is a
   * label made of **user content**. The parent dashboard names a section after
   * each child, and a family is free to enter a name of any length; without a
   * cap, one long name pushes every other entry off the bar.
   */
  truncateLabel?: boolean;
}

interface DashboardSectionPillProps {
  sections: readonly DashboardSection[];
  ariaLabel: string;
}

export function DashboardSectionPill({
  sections,
  ariaLabel,
}: DashboardSectionPillProps) {
  const [activeSection, setActiveSection] = useState<string>(
    sections[0]?.id ?? "",
  );

  useEffect(() => {
    // Pick the section whose top has scrolled past a reference line just
    // below the pill (~9rem from the top of the viewport — header 4rem +
    // pill ~3rem + padding). Driven by scroll position rather than
    // IntersectionObserver because short sections fall outside any
    // reasonable observer band, leaving the highlight on the *next*
    // section even when the user just scrolled the short one to the top.
    const REFERENCE_OFFSET_PX = 144;

    const update = () => {
      let activeId = sections[0]?.id ?? "";
      for (const { id } of sections) {
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top - REFERENCE_OFFSET_PX <= 0) {
          activeId = id;
        } else {
          break;
        }
      }
      setActiveSection(activeId);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [sections]);

  const handleClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    id: string,
  ) => {
    e.preventDefault();
    // Shared with the About page's pill and the product page's jump-to-signup
    // button —
    // see the helper for why it is native `scrollIntoView` and why the landing
    // offset stays in CSS (`scroll-mt-*` on the section).
    scrollToAnchor(id);
  };

  return (
    <nav
      aria-label={ariaLabel}
      // Pinned just below the fixed 4rem header. Always visible — dashboard
      // pages have no hero to compete with the way the public Home page does.
      // Sections that scroll to themselves use `scroll-mt-32` (8rem) to land
      // clear of: 4rem header (top-0) + 1rem gap + ~3rem pill (top-20 plus
      // its own height). Keep these in sync if the header height or pill
      // sizing changes.
      // `max-w-full` + the bar's own horizontal scroll are the overflow floor:
      // a family with several children gets one entry per child, and on a phone
      // that row can be wider than the screen however short each label is.
      // Without them the bar simply widens past the viewport and takes the whole
      // document's horizontal scroll with it, which moves every page under it.
      className="sticky top-20 z-40 mx-auto -mt-2 mb-6 w-fit max-w-full"
    >
      <ul className="flex items-center gap-1 overflow-x-auto rounded-full border border-border bg-background/90 p-1 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/70">
        {sections.map(({ id, label, truncateLabel }) => (
          <li key={id} className="shrink-0">
            <a
              href={`#${id}`}
              onClick={(e) => handleClick(e, id)}
              aria-current={activeSection === id ? "location" : undefined}
              // A truncated entry is the one case where the visible text is not
              // the whole name. `title` recovers it on a pointer and nowhere
              // else — a phone has no hover, which is exactly where the bar is
              // tightest — so the full name is given to assistive tech
              // outright rather than left inside a tooltip nobody can open.
              title={truncateLabel ? label : undefined}
              aria-label={truncateLabel ? label : undefined}
              className={cn(
                "block rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-300 ease-[cubic-bezier(0.65,0,0.35,1)] sm:px-4 sm:text-sm",
                truncateLabel && "max-w-24 truncate",
                activeSection === id
                  ? "bg-act text-act-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
