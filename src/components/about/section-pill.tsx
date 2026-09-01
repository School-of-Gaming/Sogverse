"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { scrollToAnchor } from "@/lib/navigation/scroll-to-anchor";
import { cn } from "@/lib/utils";

/**
 * The page's three sections, in the order they are laid out. Owned here rather
 * than passed in: `/about` is the only page that draws this bar, and the array
 * is what keeps the anchors, the labels and the scrollspy's ordering in one
 * place. Each id is the `id` attribute of the matching section on the page.
 *
 * `about` and `yty` take their labels from `header.nav`, the same keys the
 * header once used for them; `faq` was added there so all three read from one
 * namespace.
 */
const SECTIONS = ["about", "yty", "faq"] as const;
type SectionId = (typeof SECTIONS)[number];

/**
 * The in-page section nav for `/about`.
 *
 * **Visible from first paint**, unlike the home page's version of this bar,
 * which stayed hidden until the reader scrolled past the hero. There is no hero
 * here — the reader arrives at the top of a three-section page — so hiding the
 * navigation is hiding it at exactly the moment it is useful. It is `sticky`
 * rather than `fixed` for the same reason: with nothing to float over it can
 * take a slot of its own in the flow and stop overlapping the first heading.
 *
 * Scrollspy by scroll position rather than `IntersectionObserver`: the FAQ is
 * the last section and, with every answer collapsed, is short enough that no
 * reasonable observer band ever contains it — the highlight would stick on Yty
 * however far the reader scrolled. Taking the last section whose top has passed
 * a reference line just below the bar has no such blind spot.
 */
export function SectionPill() {
  const t = useTranslations("header.nav");
  const a = useTranslations("about");
  const [activeSection, setActiveSection] = useState<SectionId>(SECTIONS[0]);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const update = () => {
      // The reference line is the bar's own underside — measured, never a
      // literal derived from the header height. Once stuck, that is exactly
      // where the readable part of the viewport begins, and it follows a
      // resized header, a wrapped label or a changed offset for free. Before
      // the bar sticks the line sits lower, which costs nothing: the first
      // section is the fallback anyway.
      const line = navRef.current?.getBoundingClientRect().bottom ?? 0;

      let activeId: SectionId = SECTIONS[0];
      for (const id of SECTIONS) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top - line <= 0) {
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
  }, []);

  const handleClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    id: SectionId,
  ) => {
    e.preventDefault();
    // Shared with the dashboard pill and the product page's jump-to-signup
    // button — see the helper for why it is native `scrollIntoView` and why the
    // landing offset stays in CSS (`scroll-mt-*` on the section).
    scrollToAnchor(id);
  };

  return (
    <nav
      ref={navRef}
      aria-label={a("sectionNav")}
      // Sticks one rem below the header, read from the variable rather than
      // spelled as `top-20` so a resized header takes the bar with it.
      // `max-w-full` plus the row's own horizontal scroll are the overflow
      // floor at 360px: three labels in the widest locale must never widen the
      // document.
      className="sticky top-[calc(var(--header-height)+1rem)] z-40 mx-auto mt-6 w-fit max-w-full px-4"
    >
      <ul className="glass-panel flex items-center gap-1 overflow-x-auto rounded-full border border-border p-1 shadow-lg">
        {SECTIONS.map((id) => (
          <li key={id} className="shrink-0">
            <a
              href={`#${id}`}
              onClick={(e) => handleClick(e, id)}
              aria-current={activeSection === id ? "location" : undefined}
              className={cn(
                // whitespace-nowrap: a multi-word label ("À propos", "Om oss")
                // wraps mid-pill rather than the row keeping its width once the
                // bar hits its max.
                "block whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-300 ease-[cubic-bezier(0.65,0,0.35,1)] sm:px-4 sm:text-sm",
                activeSection === id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(id)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
