"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { ROUTES } from "@/lib/constants";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";

interface RoomLinkChipProps {
  /** Uppercase 4-character room code. */
  code: string;
  /**
   * `"full"` (default) — a wide chip showing the host-relative URL, sized for
   * a card it has to itself: the create card, the "you left" screen, the join
   * lobby.
   *
   * `"compact"` — a small bordered button showing just the room code, for a
   * spot where the link is a secondary affordance beside other content (the
   * in-call title row). Both copy exactly the same absolute URL.
   */
  variant?: "full" | "compact";
  /** Hide the "click to copy" hint underneath the chip. Full variant only —
   *  the compact one has no room for a hint and never renders it. */
  hideHint?: boolean;
}

/**
 * Clickable URL chip — click to copy. Shared everywhere a room link is handed
 * out (create card, lobby, in-call title row, "you left" screen) so they all
 * look and behave identically.
 *
 * Renders the host-relative URL (e.g. "sogverse.sog.gg/voice/ABCD") for visual
 * cleanliness, or just the code in the compact variant; both copy the full URL
 * with protocol so it pastes as a clickable link.
 */
export function RoomLinkChip({
  code,
  variant = "full",
  hideHint = false,
}: RoomLinkChipProps) {
  const t = useTranslations("voice.instant.share");
  const { copied, copy } = useCopyToClipboard();

  const host =
    typeof window !== "undefined" ? window.location.host : "sogverse.sog.gg";
  const displayUrl = `${host}${ROUTES.voice.forCode(code)}`;

  const handleCopy = () => {
    if (typeof window === "undefined") return;
    void copy(`${window.location.origin}${ROUTES.voice.forCode(code)}`);
  };

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={handleCopy}
        className={cn(
          "flex shrink-0 items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          copied && "border-success text-success",
        )}
        aria-label={copied ? t("copied") : t("copyLink")}
        title={copied ? t("copied") : t("copyLink")}
      >
        {/* The label and the code never change, so the copied state only
            recolors the chip and swaps one same-sized icon for another —
            nothing on the row moves. */}
        <span className="font-medium text-muted-foreground">
          {t("roomCode")}
        </span>
        <span className="font-mono font-semibold tracking-wider">{code}</span>
        {copied ? (
          <Check className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden />
        )}
      </button>
    );
  }

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
