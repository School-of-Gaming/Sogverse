"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface RoomLinkChipProps {
  /** Uppercase 4-character room code. */
  code: string;
  /** Hide the "click to copy" hint underneath the chip. */
  hideHint?: boolean;
}

/**
 * Clickable URL chip — click to copy. Shared between the create page and
 * the "you left" screen so both look and behave identically.
 *
 * Renders the host-relative URL (e.g. "sogverse.sog.gg/voice/ABCD") for
 * visual cleanliness; copies the full URL with protocol so it pastes as
 * a clickable link.
 */
export function RoomLinkChip({ code, hideHint = false }: RoomLinkChipProps) {
  const t = useTranslations("voice.instant.share");
  const [copied, setCopied] = useState(false);

  const host =
    typeof window !== "undefined" ? window.location.host : "sogverse.sog.gg";
  const displayUrl = `${host}${ROUTES.voice.forCode(code)}`;

  const handleCopy = async () => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}${ROUTES.voice.forCode(code)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard write can reject on insecure origins or denied
      // permissions. Silent failure is fine — the user can still copy
      // from the address bar.
    }
  };

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleCopy}
        className={cn(
          "group flex w-full max-w-md items-center justify-center gap-3 rounded-lg border border-border bg-muted/40 px-5 py-4 text-base font-mono font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          copied && "border-success text-success",
        )}
        aria-label={copied ? t("copied") : displayUrl}
      >
        <span className="truncate">{displayUrl}</span>
        {copied ? (
          <Check className="h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <Copy className="h-4 w-4 shrink-0 opacity-60 group-hover:opacity-100" aria-hidden />
        )}
      </button>
      {!hideHint && (
        <p className="text-xs text-muted-foreground">
          {copied ? t("copied") : t("hint")}
        </p>
      )}
    </div>
  );
}
