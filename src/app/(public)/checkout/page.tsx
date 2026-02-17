"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/providers";

function CheckoutRedirect() {
  const { user, profile, isLoading } = useAuth();
  const searchParams = useSearchParams();
  const packageId = searchParams.get("package");
  const triggered = useRef(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (triggered.current) return;

    if (!packageId) {
      window.location.href = "/sorg";
      return;
    }

    // Wait for auth to finish loading before making any decisions
    if (isLoading) return;

    if (!user || profile?.role !== "customer") {
      window.location.href = `/login?redirect=${encodeURIComponent(`/checkout?package=${packageId}`)}`;
      return;
    }

    triggered.current = true;

    fetch("/api/checkout/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageId, returnPath: "/sorg" }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.url) {
          window.location.href = data.url;
        } else {
          setError(true);
        }
      })
      .catch(() => {
        setError(true);
      });
  }, [user, profile, isLoading, packageId]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Something went wrong starting checkout. Please <a href="/sorg" className="underline">go back</a> and try again.
        </AlertDescription>
      </Alert>
    );
  }

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
