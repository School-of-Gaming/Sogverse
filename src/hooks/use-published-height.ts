"use client";

import { useEffect, type RefObject } from "react";

/**
 * Publishes an element's own height as a CSS custom property on that element.
 *
 * It exists for one mechanism: a sticky side column's two-end clamp, its
 * inset written `min(header offset, 100vh - column height - gap)`, so a column
 * taller than the window scrolls up with the page until its bottom meets the
 * viewport's and clamps there, and its last control can always be reached. CSS
 * cannot measure a box, so JS supplies the one number CSS cannot derive and
 * CSS does the rest, which keeps the whole mechanism a single declaration
 * rather than a scroll handler. The product page's signup rail and a landing
 * page's sticky cards use it; each element carries its own value, so two
 * columns on one page never share a height.
 *
 * **Written to the DOM rather than held in React state, deliberately.** The
 * value feeds nothing but a sticky inset, and a sticky inset changes where a
 * box *pins*, never where it is painted in flow — so there is nothing for a
 * re-render to do, and a state update here would re-render the whole page body
 * every time the column changed height. The consuming declaration resolves the
 * property to `0px` until it is written (a default in `globals.css`, or a
 * `var()` fallback), which is the value that makes the clamp a no-op: the
 * server-rendered frame pins under the header, and the first measurement only
 * ever *lowers* the inset, on a column genuinely taller than the window.
 *
 * A `ResizeObserver` rather than a one-off read, because the column changes
 * height on its own schedule — a countdown finishing, a form swapping for its
 * answer — and a stale height would clamp to the wrong place. Window resizes
 * are watched too: the viewport is the other half of the comparison and it
 * does not move the element.
 */
export function usePublishedHeight(
  ref: RefObject<HTMLElement | null>,
  property: string,
) {
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const measure = () =>
      element.style.setProperty(property, `${element.offsetHeight}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ref, property]);
}
