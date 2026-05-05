"use client";

import { useCallback, useState } from "react";

/**
 * Drives the "stay disabled until the page actually unloads" pattern for
 * any button that hands the user off to an external URL (Stripe Checkout,
 * the Stripe billing portal, an OAuth provider, etc.).
 *
 * The need: a mutation's `isPending` flips back to `false` the instant
 * `onSuccess` returns, but `window.location.href = ...` schedules the
 * navigation asynchronously. There is a brief frame where the button
 * re-enables, the spinner stops, and a fast user can double-click — which
 * either fires the mutation again or interleaves two navigations. The fix
 * is a flag that stays `true` from the moment we start the redirect until
 * the document unloads (and is therefore replaced wholesale).
 *
 * Usage:
 *   const { redirecting, redirectTo } = useExternalRedirect();
 *   const submitting = mutation.isPending || redirecting;
 *   ...
 *   mutation.mutate(input, { onSuccess: (r) => redirectTo(r.url) });
 *
 * For *internal* Next.js navigation after a mutation, use React's
 * `useTransition` instead — see `admin/products/[id]/page.tsx` for the
 * canonical pattern (`disabled={mutation.isPending || isNavigating}`).
 */
export function useExternalRedirect() {
  const [redirecting, setRedirecting] = useState(false);

  const redirectTo = useCallback((url: string) => {
    setRedirecting(true);
    // Same tick as the state update — the next paint will see `redirecting`
    // true *and* the document already swapping out. Never clear; the flag
    // dies with the page.
    window.location.href = url;
  }, []);

  return { redirecting, redirectTo };
}
