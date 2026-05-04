"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ROUTES } from "@/lib/constants";

// Allowlisted prefixes for post-auth redirects. Anything else is dropped
// and the user lands on the fallback (their dashboard). Keep this in sync
// with the public detail-page roots in `src/app/(public)/` — every product
// type that exposes a "Sign in to enroll" CTA needs its root listed here,
// or sign-in will silently send the user to their dashboard instead of
// back to the page they came from.
const SAFE_REDIRECT_PREFIXES: readonly string[] = [
  `${ROUTES.checkout}?`,
  `${ROUTES.products}/`, // /clubs/[id]
  `${ROUTES.camps}/`,    // /camps/[id]
  `${ROUTES.events}/`,   // /events/[id]
];

/** Returns `redirect` if it points to a known safe destination, else `null`. */
export function resolveSafeRedirect(redirect: string | null): string | null {
  if (!redirect) return null;
  return SAFE_REDIRECT_PREFIXES.some((p) => redirect.startsWith(p))
    ? redirect
    : null;
}

/**
 * Manages the redirect-after-auth flow (e.g. user clicks Buy → login/register → checkout).
 *
 * Returns:
 * - `redirect`: the raw redirect path from ?redirect= (or null)
 * - `status`: a user-facing message like "Redirecting to checkout..." (or null)
 * - `navigateAfterAuth`: call this after successful login/signup with a fallback path
 */
export function useAuthRedirect() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  const [status, setStatus] = useState<string | null>(null);

  const safeRedirect = resolveSafeRedirect(redirect);

  const navigateAfterAuth = (fallbackPath: string) => {
    if (safeRedirect) {
      setStatus("Redirecting...");
    }
    window.location.href = safeRedirect || fallbackPath;
  };

  return { redirect, status, navigateAfterAuth };
}
