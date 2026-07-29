"use client";

import { useEffect, useState } from "react";

/**
 * The house skeleton-reveal delay. One number, owned here: loads on a warm
 * React Query cache cluster under ~200ms, so anything shorter still let the
 * stragglers flash a skeleton for a blink; anything much longer starts to
 * feel like dead air on genuinely slow loads. Pair the reveal with an opacity
 * fade so a load finishing just past the threshold sees a faint shimmer, not
 * a hard flash.
 */
export const SKELETON_REVEAL_MS = 250;

/**
 * False for the first `ms` after mount (default `SKELETON_REVEAL_MS`), then
 * true.
 *
 * The anti-flash gate for loading placeholders: a skeleton that appears
 * instantly is wrong twice on a fast response — it paints for two frames and
 * reads as a broken flicker. Gate the skeleton's *visibility* on this (inside
 * a container that already has its final size, per the layout rule) and a
 * fast path shows calm nothing while a slow one still gets its skeleton.
 */
export function useRevealAfter(ms: number = SKELETON_REVEAL_MS): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setVisible(true), ms);
    return () => window.clearTimeout(id);
  }, [ms]);

  return visible;
}
