"use client";

import { Blocks, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface RobloxUsernameBadgeProps {
  /** The saved Roblox username, or null if none has been provided. */
  username: string | null;
  /**
   * The verified Roblox account id. Present only once the account is verified —
   * it is the numeric key every Roblox API takes, and the thing that proves the
   * handle resolved to a real account.
   */
  userId: number | null;
  /**
   * `"sm"` (default) for compact contexts — gamer chips, rosters.
   * `"base"` for standalone profile detail lines.
   */
  size?: "sm" | "base";
  className?: string;
}

/**
 * Read-only display of a gamer's Roblox username and its verification state —
 * the inline form, for a surface that wants the identity on one line rather than
 * the avatar-bearing row. It is the one place these three states are styled, so
 * a caller renders it instead of restating the colours:
 *   - verified (account id set) → success green + check
 *   - entered-but-unverified (username only) → warning amber
 *   - not provided (neither) → muted "(Unknown)"
 *
 * The blocks icon is the only hint that the line is about Roblox — callers don't
 * prefix a "Roblox:" label. Verbose state lives in the aria-label.
 *
 * This shows the **handle**, not the display name. The handle is the unique one,
 * so it is what identifies an account; the display name is surfaced next to it
 * where there is room for both, not in its place.
 */
export function RobloxUsernameBadge({
  username,
  userId,
  size = "sm",
  className,
}: RobloxUsernameBadgeProps) {
  const t = useTranslations("roblox.account");

  const text = size === "sm" ? "text-[11px]" : "text-sm";
  const icon = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";

  if (username && userId !== null) {
    return (
      <p
        className={cn(
          "inline-flex items-center gap-1 leading-tight text-success",
          text,
          className,
        )}
        aria-label={t("verifiedUser", { username })}
      >
        <Blocks className={cn("shrink-0", icon)} aria-hidden />
        <span className="truncate">{username}</span>
        <Check className={cn("shrink-0", icon)} aria-hidden />
      </p>
    );
  }

  if (username) {
    return (
      <p
        className={cn(
          "inline-flex items-center gap-1 leading-tight text-warning",
          text,
          className,
        )}
        aria-label={t("unverified", { username })}
      >
        <Blocks className={cn("shrink-0", icon)} aria-hidden />
        <span className="truncate">{username}</span>
      </p>
    );
  }

  return (
    <p
      className={cn(
        "inline-flex items-center gap-1 leading-tight text-muted-foreground",
        text,
        className,
      )}
      aria-label={t("none")}
    >
      <Blocks className={cn("shrink-0", icon)} aria-hidden />
      <span>{t("none")}</span>
    </p>
  );
}
