"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { LocalePicker } from "@/components/layout/locale-picker";
import { cn } from "@/lib/utils";

interface InstantVoiceHeaderProps {
  /** Uppercase 4-character room code. Displayed; clicking copies the full URL. */
  code: string;
}

/**
 * Simplified header for the public on-the-fly voice page (`/voice/[code]`).
 *
 * Replaces the standard app `Header` for this route group. Differences:
 *   - The "SOG Sogverse" mark is non-clickable. Tapping the logo of the main
 *     header navigates home, which would yank a user out of an active call.
 *   - The right side shows the room code as a copy-URL button instead of the
 *     auth section / public nav. Clicking copies the full room URL so a mod
 *     can paste it into chat without leaving the call.
 *   - Reuses `LocalePicker` verbatim so the language switcher is consistent
 *     with the rest of the app.
 *
 * Visual styling (fixed top bar + backdrop blur + brand-colored logo) matches
 * `src/components/layout/header.tsx` so any future styling change to the
 * main header carries over here naturally.
 */
export function InstantVoiceHeader({ code }: InstantVoiceHeaderProps) {
  const c = useTranslations("common");
  const t = useTranslations("voice.instant");
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/voice/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard write can reject on insecure origins or denied permissions.
      // Silent failure is fine — user can still copy from the address bar.
    }
  };

  return (
    <header className="fixed top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <nav className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <span className="font-display text-xl font-bold text-primary">SOG</span>
          <span className="hidden text-lg font-semibold sm:inline-block">
            {c("appName")}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className={cn(
              "flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-3 py-1.5 font-mono text-sm font-semibold tracking-wider transition-colors hover:bg-accent hover:text-accent-foreground",
              copied && "border-success text-success",
            )}
            aria-label={copied ? t("header.copied") : t("header.copyLink")}
            title={copied ? t("header.copied") : t("header.copyLink")}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden />
            )}
            <span>{code}</span>
          </button>
          <LocalePicker />
        </div>
      </nav>
    </header>
  );
}
