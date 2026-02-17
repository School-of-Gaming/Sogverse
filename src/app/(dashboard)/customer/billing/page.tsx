"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function BillingRedirectPage() {
  const triggered = useRef(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (triggered.current) return;
    triggered.current = true;

    fetch("/api/checkout/subscription/billing-portal", { method: "POST" })
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
  }, []);

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Something went wrong opening the billing portal. Please <a href="/customer/sorg" className="underline">go back</a> and try again.
          </AlertDescription>
        </Alert>
      ) : (
        <p className="text-muted-foreground animate-pulse">
          Redirecting to billing portal...
        </p>
      )}
    </div>
  );
}
