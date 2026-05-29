"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Click-to-copy state machine shared by every copy affordance — the instant
 * voice room-link chip + header, and the gedu roster's per-parent email cell
 * and "copy all parent emails" button.
 *
 * `copy(text)` writes to the clipboard and flips `copied` true for `resetMs`,
 * then back. Clipboard writes reject on insecure origins or denied
 * permission; those resolve to `false` (and leave `copied` false) without
 * throwing, so callers keep the silent-failure UX — the user can always
 * select-and-copy manually. The reset timer is cleared on unmount so a copy
 * just before navigation doesn't fire `setState` on an unmounted component.
 */
export function useCopyToClipboard(resetMs = 1500): {
  copied: boolean;
  copy: (text: string) => Promise<boolean>;
} {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(
    async (text: string) => {
      // No `navigator.clipboard` guard: on an insecure origin it's undefined
      // at runtime (the DOM types say otherwise), so reading `.writeText`
      // throws — which the catch below turns into the same `false` we'd
      // return here. SSR can't reach this ("use client" + click handler).
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setCopied(false), resetMs);
        return true;
      } catch {
        return false;
      }
    },
    [resetMs],
  );

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  return { copied, copy };
}
