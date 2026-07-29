"use client";

import { useEffect, useState } from "react";

/**
 * False for the first `ms` after mount, then true.
 *
 * The anti-flash gate for loading placeholders: a skeleton that appears
 * instantly is wrong twice on a fast response — it paints for two frames and
 * reads as a broken flicker. Gate the skeleton's *visibility* on this (inside
 * a container that already has its final size, per the layout rule) and a
 * fast path shows calm nothing while a slow one still gets its skeleton.
 */
export function useRevealAfter(ms: number): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setVisible(true), ms);
    return () => window.clearTimeout(id);
  }, [ms]);

  return visible;
}
