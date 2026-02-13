"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/providers";

export default function CheckoutRedirectPage() {
  const { user, profile } = useAuth();
  const searchParams = useSearchParams();
  const packageId = searchParams.get("package");
  const triggered = useRef(false);

  useEffect(() => {
    if (triggered.current) return;

    if (!packageId) {
      window.location.href = "/sorg";
      return;
    }

    if (!user || profile?.role !== "customer") {
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
  }, [user, profile, packageId]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <p className="text-muted-foreground animate-pulse">
        Redirecting to checkout...
      </p>
    </div>
  );
}
