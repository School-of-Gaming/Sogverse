"use client";

/**
 * A page section that only costs anything while the reader is near it.
 *
 * The exploration page shows nineteen expanded deep dives plus twenty studies,
 * all animated — the standing ruling is "animate everything at once", and with
 * this wrapper it survives at that scale as "animate everything the reader can
 * see", which is the same promise to a human with eyes. Two mechanisms, both
 * on the section element:
 *
 * 1. **`content-visibility: auto`** lets the browser skip layout and paint for
 *    sections outside the viewport entirely. `contain-intrinsic-size` supplies
 *    the placeholder height so the scrollbar stays honest; the estimates are
 *    written at the call sites (measured from the served page, see
 *    `SECTION_HEIGHTS` in the page file) rather than measured at runtime — the
 *    repo's layout rule prefers a stated estimate to a post-mount correction.
 *    An anchor jump into a skipped section is safe: the spec renders the
 *    target before scrolling to it.
 *
 * 2. **`animation-play-state: paused`** on everything inside a section that is
 *    more than one viewport away. `content-visibility` stops the *painting*,
 *    but a CSS animation on an unpainted element still ticks its style clock;
 *    with thousands of keyframe channels on this page that bookkeeping alone
 *    is the jank. One shared IntersectionObserver (one viewport of margin)
 *    flips a class; the paused rule lives in the page's own style block so it
 *    is a literal class name Tailwind's scanner can ignore.
 *
 * The section renders un-paused on the server and pauses only after the
 * observer's first callback, so a reader with JavaScript disabled gets the
 * old behaviour — everything running — rather than a frozen page.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

type Entry = { el: Element; setNear: (near: boolean) => void };

let observer: IntersectionObserver | undefined;
const entries = new Map<Element, Entry>();

function observe(entry: Entry): () => void {
  if (observer === undefined) {
    observer = new IntersectionObserver(
      (hits) => {
        for (const hit of hits) entries.get(hit.target)?.setNear(hit.isIntersecting);
      },
      // One viewport of slack in both directions: a section starts running
      // before it scrolls on, so the reader never sees it wake up.
      { rootMargin: "100% 0px 100% 0px" },
    );
  }
  entries.set(entry.el, entry);
  observer.observe(entry.el);
  return () => {
    entries.delete(entry.el);
    observer?.unobserve(entry.el);
  };
}

export function ViewportSection({
  id,
  estimatedHeight,
  className = "scroll-mt-24 space-y-4",
  children,
}: {
  id: string;
  /**
   * The placeholder height (px) the browser reserves while the section is
   * skipped. Close is good enough: too small and the scrollbar creeps as
   * sections realise, too large and it jumps back. The accepted tolerance is
   * a few hundred pixels either way on a ~90k px page — under half a percent
   * of scroll position, and only ever off-screen.
   */
  estimatedHeight: number;
  className?: string;
  children: ReactNode;
}): React.JSX.Element {
  const ref = useRef<HTMLElement>(null);
  const [near, setNear] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (el === null) return undefined;
    return observe({ el, setNear });
  }, []);

  return (
    <section
      ref={ref}
      id={id}
      className={`${className}${near ? "" : " mascot-offstage"}`}
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: `auto ${estimatedHeight}px`,
      }}
    >
      {children}
    </section>
  );
}
