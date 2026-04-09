"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ROUTES } from "@/lib/constants";

export default function BillingRedirectPage() {
  const t = useTranslations('parent');
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
            {t.rich('billing.error', { link: (chunks) => <a href={ROUTES.customer.sorg} className="underline">{chunks}</a> })}
          </AlertDescription>
        </Alert>
      ) : (
        <p className="text-muted-foreground animate-pulse">
          {t('billing.redirecting')}
        </p>
      )}
    </div>
  );
}
