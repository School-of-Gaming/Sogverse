"use client";

import { useState } from "react";
import { resolveSafeRedirect } from "@/lib/navigation/post-auth-redirect";

/**
 * Manages the redirect-after-auth flow (e.g. user clicks Buy → login/register → checkout).
 *
 * **The raw `?redirect=` is passed in, not read here.** Reading it with
 * `useSearchParams()` would make every auth form a search-params consumer, and
 * in the App Router that forces the form under a `<Suspense>` boundary whose
 * *fallback* is what the server prerenders — so the page shipped a grey
 * placeholder and only built the real form after hydration. The pages read the
 * param server-side from their own `searchParams` and hand it down, which costs
 * one prop and buys a fully server-rendered form.
 *
 * Returns:
 * - `status`: a user-facing message like "Redirecting to checkout..." (or null)
 * - `safeRedirect`: the `?redirect=` once it has passed the post-auth allowlist, or null
 * - `navigateAfterAuth`: call this after successful login/signup with a fallback path
 */
export function useAuthRedirect(redirect: string | null) {
  const [status, setStatus] = useState<string | null>(null);

  const safeRedirect = resolveSafeRedirect(redirect);

  const navigateAfterAuth = (fallbackPath: string) => {
    if (safeRedirect) {
      setStatus("Redirecting...");
    }
    window.location.href = safeRedirect || fallbackPath;
  };

  return { redirect, safeRedirect, status, navigateAfterAuth };
}
