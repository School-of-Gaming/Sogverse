"use client";

/**
 * Smooth-scroll to an in-page anchor.
 *
 * The one mechanism, in one place. It was written twice — inline in the home
 * page's section pill and again in the dashboard one — and a third copy for the
 * product page's jump-to-signup button is what made the duplication worth
 * closing: three call sites agreeing by coincidence is how one of them
 * eventually grows a hand-rolled offset the others do not have.
 *
 * **Native `scrollIntoView`, deliberately, and nothing around it.** The browser
 * walks the element's ancestors, finds the real scroll container, uses its own
 * tuned animation curve, and — the part a hand-rolled `window.scrollTo` loses —
 * honours `prefers-reduced-motion` without being asked. A reader who has turned
 * animation off gets an instant jump for free.
 *
 * **The header offset is not this function's business, and must not become it.**
 * Where a target lands is owned by CSS: the target carries
 * `scroll-mt-[var(--header-height)]` (or `+1rem` for breathing room), which is
 * the site-wide rule for hash anchors and the only place the header's height is
 * read from. Computing the offset here would give one caller a second answer to
 * a question already answered, and it would go stale the day the header
 * resizes.
 *
 * A missing target is a no-op rather than a throw: the id is a static string in
 * every caller, so an absent element means the section is conditionally
 * rendered, and scrolling nowhere is the honest response.
 */
export function scrollToAnchor(id: string): void {
  document.getElementById(id)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}
