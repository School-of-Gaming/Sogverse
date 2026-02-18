"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ROUTES } from "@/lib/constants";

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

  // Only allow redirects to the checkout page — the sole post-auth redirect destination
  const safeRedirect =
    redirect?.startsWith(`${ROUTES.checkout}?`) ? redirect : null;

  const navigateAfterAuth = (fallbackPath: string) => {
    if (safeRedirect) {
      setStatus("Redirecting to checkout...");
    }
    window.location.href = safeRedirect || fallbackPath;
  };

  return { redirect, status, navigateAfterAuth };
}
