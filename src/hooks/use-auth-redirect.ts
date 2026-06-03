"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ROUTES } from "@/lib/constants";

// Allowlisted prefixes for post-auth redirects. Anything else is dropped
// and the user lands on the fallback (their dashboard). Public product detail
// pages — which expose the "Sign in to enroll" CTA — live at `/shop/[id]`, so
// the single `/shop/` prefix covers them and sign-in returns the user to the
// product they came from. The trailing slash is required so the bare `/shop`
// listing isn't itself a valid target (the redirect is meant for a specific
// product) and so `/shopxyz`-style prefix confusion can't sneak through.
const SAFE_REDIRECT_PREFIXES: readonly string[] = [
  `${ROUTES.shop}/`, // /shop/[id]
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
