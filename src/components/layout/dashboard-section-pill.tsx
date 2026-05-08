"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface DashboardSection {
  id: string;
  label: string;
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
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length > 0) {
          setActiveSection(visible[0].target.id);
        }
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: 0 },
    );

    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [sections]);

  const handleClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    id: string,
  ) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
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
      className="sticky top-20 z-40 mx-auto -mt-2 mb-6 w-fit"
    >
      <ul className="flex items-center gap-1 rounded-full border border-border bg-background/90 p-1 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/70">
        {sections.map(({ id, label }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              onClick={(e) => handleClick(e, id)}
              aria-current={activeSection === id ? "location" : undefined}
              className={cn(
                "block rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-300 ease-[cubic-bezier(0.65,0,0.35,1)] sm:px-4 sm:text-sm",
                activeSection === id
                  ? "bg-primary text-primary-foreground"
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
