"use client";

import { Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/providers";

function CheckoutRedirect() {
  const { user, profile, isLoading, refreshProfile } = useAuth();
  const searchParams = useSearchParams();
  const packageId = searchParams.get("package");
  const triggered = useRef(false);
  const refreshing = useRef(false);

  useEffect(() => {
    if (triggered.current) return;

    if (!packageId) {
      window.location.href = "/sorg";
      return;
    }

    // Wait for auth to finish loading before making any decisions
    if (isLoading) return;

    // User not authenticated — send to login with redirect back here
    if (!user) {
      window.location.href = `/login?redirect=${encodeURIComponent(`/checkout?package=${packageId}`)}`;
      return;
    }

    // User exists but profile not loaded yet (race condition after registration:
    // the DB trigger may not have committed by the time the server rendered).
    // Fetch it client-side — the next re-render will proceed.
    if (!profile) {
      if (!refreshing.current) {
        refreshing.current = true;
        refreshProfile();
      }
      return;
    }

    if (profile.role !== "customer") {
      window.location.href = `/login?redirect=${encodeURIComponent(`/checkout?package=${packageId}`)}`;
      return;
    }

    triggered.current = true;

    fetch("/api/checkout/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageId }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.url) {
          window.location.href = data.url;
        } else {
          window.location.href = "/sorg";
        }
      })
      .catch(() => {
        window.location.href = "/sorg";
      });
    // refreshProfile is intentionally excluded — it's not memoized so
    // including it would re-run the effect on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile, isLoading, packageId]);

  return (
    <p className="text-muted-foreground animate-pulse">
      Redirecting to checkout...
    </p>
  );
}

export default function CheckoutRedirectPage() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Suspense
        fallback={
          <p className="text-muted-foreground animate-pulse">
            Redirecting to checkout...
          </p>
        }
      >
        <CheckoutRedirect />
      </Suspense>
    </div>
  );
}
