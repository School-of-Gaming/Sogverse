import type { ReactNode } from "react";

/**
 * Visual chrome shared by every fixed site header (the main `<Header>` and
 * the `(voice)` group's `<InstantVoiceHeader>`). Pins the header to the top
 * of the viewport as the page scrolls and renders the frosted-glass strip
 * the rest of the chrome lives on.
 *
 * The height comes from the `--header-height` CSS variable in
 * `src/app/globals.css` — the same variable the dashboard sidebar's sticky
 * offset, the home hero's bleed-under-header trick, and hash-anchor scroll
 * margins all reference. Anything that has to line up with the header pulls
 * its measurement from there, not from a duplicated `h-16`/`top-16` literal.
 *
 * The element is `position: sticky top-0`, not `fixed`, so it participates
 * in normal flow and reserves its own slot at the top of each layout — no
 * `pt-16` offset needed on wrappers.
 */
export function SiteHeaderShell({ children }: { children: ReactNode }) {
  return (
    <header className="sticky top-0 z-50 h-[var(--header-height)] w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {children}
    </header>
  );
}
