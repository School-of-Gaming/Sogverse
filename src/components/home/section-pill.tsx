"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const SECTIONS = ["home", "about", "yty"] as const;
type SectionId = (typeof SECTIONS)[number];

const VISIBILITY_THRESHOLD_PX = 300;

export function SectionPill() {
  const t = useTranslations("header.nav");
  const [activeSection, setActiveSection] = useState<SectionId>("home");
  const [isVisible, setIsVisible] = useState(false);

  // Scrollspy: which section is currently "in view"
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length > 0) {
          setActiveSection(visible[0].target.id as SectionId);
        }
      },
      // Active band sits in the upper third of the viewport so the pill
      // updates as the user scrolls a section's heading into view.
      { rootMargin: "-20% 0px -60% 0px", threshold: 0 },
    );

    SECTIONS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  // Visibility: hidden on initial load so it doesn't compete with the hero,
  // then revealed once the user scrolls past the hero — and *stays* visible
  // from that point on. Disappearing again when the user clicks Home and
  // scrolls back to the top would feel like the navigation is being taken
  // away mid-interaction.
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > VISIBILITY_THRESHOLD_PX) {
        setIsVisible(true);
        window.removeEventListener("scroll", handleScroll);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: SectionId) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    // Native smooth scroll — browser walks ancestors, finds the <main> scroll
    // container, and uses its tuned animation curve. Honors prefers-reduced-motion.
    // scroll-margin-top on the section element controls the landing offset.
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav
      aria-label={t("home")}
      className={cn(
        "fixed left-1/2 top-20 z-40 -translate-x-1/2 transition-opacity duration-300 ease-[cubic-bezier(0.65,0,0.35,1)]",
        isVisible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <ul className="flex items-center gap-1 rounded-full border border-border bg-background/90 p-1 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/70">
        {SECTIONS.map((id) => (
          <li key={id}>
            <a
              href={`#${id}`}
              onClick={(e) => handleClick(e, id)}
              aria-current={activeSection === id ? "true" : undefined}
              className={cn(
                "block rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-300 ease-[cubic-bezier(0.65,0,0.35,1)] sm:px-4 sm:text-sm",
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
