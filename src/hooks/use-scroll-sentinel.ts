"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * What the sentinel's visibility is judged against: the viewport by default, or
 * a scroll container when the list scrolls inside one rather than with the page
 * — a sheet body, a panel with its own overflow. A ref is accepted as well as an
 * element, because a container is normally reached by one.
 */
export type ScrollSentinelRoot = Element | RefObject<Element | null> | null;

export interface ScrollSentinelOptions {
  /**
   * Whether the sentinel is armed. It is the caller's lever for "stop asking":
   * a surface fetching a page holds this false until the page lands, which is
   * what keeps one reveal from firing the next before the first has arrived.
   * Turning it back on re-asks whether the sentinel is in view, so a page too
   * short to push the sentinel off screen still reveals the one after it.
   */
  enabled: boolean;
  /** Run when the reader reaches the sentinel. Need not be referentially stable. */
  onReach: () => void;
  /** How far beyond the root's edge counts as reached, e.g. `"800px 0px"`. */
  rootMargin?: string;
  root?: ScrollSentinelRoot;
}

/**
 * The bottom of a list that grows as the reader scrolls into it: a hairline
 * below the last row, and a call when they reach it.
 *
 * Shared because the mechanics are the same wherever it is used and the ways of
 * getting them subtly wrong are the same too. Two of those are worth naming,
 * because both look like the hook doing nothing:
 *
 * - **An observer reports a *change* of intersection**, so a sentinel that is
 *   still on screen after the reveal it triggered would never fire again, and a
 *   run of reveals would stop after one. Re-observing the target queues a fresh
 *   report, which is what asks the question again — and it is why the target has
 *   to be released first, since observing an already-observed element does
 *   nothing at all.
 * - **The element has to be held as state, not in a ref**, because the work is
 *   an effect and an effect cannot see a ref being filled in. Handing out the
 *   setter (which is stable) is what keeps the sentinel attached across renders
 *   rather than detached and reattached on each one.
 *
 * What the caller owns is when to stop: `enabled` while a page is in flight, and
 * unmounting the sentinel once there is nothing left to reach for.
 *
 * @returns the ref callback for the sentinel element.
 */
export function useScrollSentinel({
  enabled,
  onReach,
  rootMargin,
  root,
}: ScrollSentinelOptions): (node: Element | null) => void {
  const [sentinel, setSentinel] = useState<Element | null>(null);

  // The latest callback in a ref, so a caller may pass an inline arrow without
  // the observer being torn down and rebuilt on every render.
  const onReachRef = useRef(onReach);
  useEffect(() => {
    onReachRef.current = onReach;
  }, [onReach]);

  useEffect(() => {
    if (!enabled || sentinel === null) return;

    // Resolved here rather than during render: a ref may not be read while
    // rendering, and by the time this runs the container is attached — it is an
    // ancestor of the sentinel, so it cannot arrive later than the sentinel did.
    const container =
      root === null || root === undefined
        ? null
        : root instanceof Element
          ? root
          : root.current;

    const observer = new IntersectionObserver(
      (records) => {
        if (!records.some((record) => record.isIntersecting)) return;
        // Re-arm before handing over, so a sentinel still in view after the
        // caller's reveal asks again at the next rendering opportunity. The
        // caller stops the run by disarming or by unmounting the sentinel;
        // either tears this observer down before that next report arrives.
        observer.unobserve(sentinel);
        observer.observe(sentinel);
        onReachRef.current();
      },
      { root: container, rootMargin },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled, sentinel, root, rootMargin]);

  return setSentinel;
}
