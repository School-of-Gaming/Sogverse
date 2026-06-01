"use client";

import { Check, Pickaxe } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface MinecraftUsernameBadgeProps {
  /** The saved Minecraft username, or null if none has been provided. */
  username: string | null;
  /** The verified Minecraft UUID. Present only once the account is verified. */
  uuid: string | null;
  /**
   * `"sm"` (default) for compact contexts — gamer chips, rosters.
   * `"base"` for standalone profile detail lines.
   */
  size?: "sm" | "base";
  className?: string;
}

/**
 * Read-only display of a gamer's Minecraft username and its verification state.
 * The single source of truth for the three states used across the app:
 *   - verified (uuid set) → success green + check
 *   - entered-but-unverified (username only) → warning amber
 *   - not provided (neither) → muted "(Unknown)"
 *
 * The pickaxe icon is the only hint that the line is about Minecraft — callers
 * don't prefix a "Minecraft:" label. Verbose state lives in the aria-label.
 */
export function MinecraftUsernameBadge({
  username,
  uuid,
  size = "sm",
  className,
}: MinecraftUsernameBadgeProps) {
  const t = useTranslations("minecraft");

  const text = size === "sm" ? "text-[11px]" : "text-sm";
  const icon = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";

  if (username && uuid) {
    return (
      <p
        className={cn(
          "inline-flex items-center gap-1 leading-tight text-success",
          text,
          className,
        )}
        aria-label={t("verified")}
      >
        <Pickaxe className={cn("shrink-0", icon)} aria-hidden />
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
        <Pickaxe className={cn("shrink-0", icon)} aria-hidden />
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
      aria-label={t("notProvided")}
    >
      <Pickaxe className={cn("shrink-0", icon)} aria-hidden />
      <span>{t("none")}</span>
    </p>
  );
}
