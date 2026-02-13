"use client";

import { useEffect, useRef } from "react";

export default function BillingRedirectPage() {
  const triggered = useRef(false);

  useEffect(() => {
    if (triggered.current) return;
    triggered.current = true;

    fetch("/api/checkout/subscription/billing-portal", { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        if (data.url) {
          window.location.href = data.url;
        } else {
          window.location.href = "/customer/sorg";
        }
      })
      .catch(() => {
        window.location.href = "/customer/sorg";
      });
  }, []);

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <p className="text-muted-foreground animate-pulse">
        Redirecting to billing portal...
      </p>
    </div>
  );
}
