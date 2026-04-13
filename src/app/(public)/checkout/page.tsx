"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from 'next-intl';
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/providers";
import { useCurrency } from "@/hooks/use-currency";
import { ROUTES } from "@/lib/constants";

function CheckoutRedirect() {
  const { user, profile, isLoading } = useAuth();
  const { currency } = useCurrency();
  const searchParams = useSearchParams();
  const priceId = searchParams.get("priceId");
  const triggered = useRef(false);
  const [error, setError] = useState(false);
  const t = useTranslations('checkout');

  useEffect(() => {
    if (triggered.current) return;

    if (!priceId) {
      window.location.href = ROUTES.sorg;
      return;
    }

    // Wait for auth to finish loading before making any decisions
    if (isLoading) return;

    if (!user || profile?.role !== "customer") {
      window.location.href = `${ROUTES.login}?redirect=${encodeURIComponent(`${ROUTES.checkout}?priceId=${priceId}`)}`;
      return;
    }

    triggered.current = true;

    fetch("/api/checkout/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceId, currency, returnPath: ROUTES.sorg }),
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
  }, [user, profile, isLoading, priceId, currency]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {t.rich('error', {
            link: (chunks) => <a href={ROUTES.sorg} className="underline">{chunks}</a>,
          })}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <p className="text-muted-foreground animate-pulse">
      {t('redirecting')}
    </p>
  );
}

export default function CheckoutRedirectPage() {
  const t = useTranslations('checkout');

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Suspense
        fallback={
          <p className="text-muted-foreground animate-pulse">
            {t('redirecting')}
          </p>
        }
      >
        <CheckoutRedirect />
      </Suspense>
    </div>
  );
}
