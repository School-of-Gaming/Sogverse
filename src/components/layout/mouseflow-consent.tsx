"use client";

// Beta-only: session recording consent banner. Remove this file (and its
// references in src/app/layout.tsx, src/proxy.ts, and messages/*.json) when
// Beta ends. See plan: immutable-knitting-waterfall.md.

import { useSyncExternalStore } from "react";
import Script from "next/script";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { getCookie, setCookie } from "@/lib/cookies";

const MOUSEFLOW_PROJECT_ID = "a379136f-823f-4650-9b33-5dfb5d9d94b7";
const CONSENT_COOKIE = "mouseflowConsent";

type Consent = "accepted" | "declined" | "unset";

// Module-level pub/sub so Accept/Decline clicks can update useSyncExternalStore
// subscribers in the same component without a stale read from document.cookie.
const listeners = new Set<() => void>();
let cachedConsent: Consent | null = null;
function notify() {
  cachedConsent = null;
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function getSnapshot(): Consent {
  if (cachedConsent !== null) return cachedConsent;
  const stored = getCookie(CONSENT_COOKIE);
  cachedConsent = stored === "accepted" || stored === "declined" ? stored : "unset";
  return cachedConsent;
}
function getServerSnapshot(): Consent | null {
  return null;
}

interface MouseflowConsentProps {
  nonce?: string;
}

export function MouseflowConsent({ nonce }: MouseflowConsentProps) {
  const t = useTranslations("mouseflow");
  const consent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (consent === null || consent === "declined") return null;

  if (consent === "accepted") {
    return (
      <Script
        src={`https://cdn.mouseflow.com/projects/${MOUSEFLOW_PROJECT_ID}.js`}
        strategy="afterInteractive"
        nonce={nonce}
      />
    );
  }

  const choose = (choice: "accepted" | "declined") => {
    setCookie(CONSENT_COOKIE, choice);
    notify();
  };

  return (
    <div
      role="dialog"
      aria-label={t("title")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="text-sm text-card-foreground">
          <p className="font-semibold">{t("title")}</p>
          <p className="mt-1 text-muted-foreground">{t("body")}</p>
        </div>
        <div className="flex shrink-0 gap-2 sm:flex-row-reverse">
          <Button size="sm" onClick={() => choose("accepted")}>
            {t("accept")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => choose("declined")}>
            {t("decline")}
          </Button>
        </div>
      </div>
    </div>
  );
}
