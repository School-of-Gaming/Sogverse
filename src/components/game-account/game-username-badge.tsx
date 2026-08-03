"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  GAME_PLATFORMS,
  type GameAccountExternalId,
  type GamePlatform,
} from "./platforms";

interface GameUsernameBadgeProps {
  /** Which platform this identity is on. */
  platform: GamePlatform;
  /** The saved username, or `null` if none has been provided. */
  username: string | null;
  /**
   * The platform's own account key, present only once a lookup confirmed one.
   * Its **presence is the whole of "verified"** — nothing here reads the value,
   * which is why a Mojang UUID and a Roblox numeric id can share this prop
   * without being pretended to be the same kind of thing.
   */
  externalId: GameAccountExternalId | null;
  /**
   * `"sm"` (default) for compact contexts — gamer chips, rosters.
   * `"base"` for standalone profile detail lines.
   */
  size?: "sm" | "base";
  className?: string;
}

/**
 * Read-only display of a gamer's game username and its verification state — the
 * inline form, for a surface that wants the identity on one line rather than the
 * figure-bearing row. It is the one place these three states are styled, so a
 * caller renders it instead of restating the colours:
 *   - verified (an account key is held) → success green + check
 *   - entered-but-unverified (username only) → warning amber, tick absent
 *   - not provided (neither) → muted "(Unknown)"
 *
 * The platform's icon is the only hint which game the line is about — callers
 * don't prefix a `"Minecraft:"` label. Verbose state lives in the aria-label.
 *
 * This shows the **handle**, not the display name. The handle is the unique one,
 * so it is what identifies an account; a display name is surfaced next to it
 * where there is room for both, not in its place.
 *
 * The badge has no `checking` state, and that is deliberate rather than an
 * omission: it is the density variant for a place with room for one line — a
 * chip, a roster cell, a detail line — and none of those is a place a lookup is
 * run from. The surface that runs one renders the row, which owns a fixed square
 * for the spinner.
 */
export function GameUsernameBadge({
  platform,
  username,
  externalId,
  size = "sm",
  className,
}: GameUsernameBadgeProps) {
  const t = useTranslations("gameAccount");
  const { Icon } = GAME_PLATFORMS[platform];

  const text = size === "sm" ? "text-[11px]" : "text-sm";
  const icon = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";

  const verified = username !== null && externalId !== null;

  return (
    <p
      className={cn(
        "inline-flex items-center gap-1 leading-tight",
        verified
          ? "text-success"
          : username !== null
            ? "text-warning"
            : "text-muted-foreground",
        text,
        className,
      )}
      aria-label={
        username === null
          ? t("none")
          : verified
            ? t("verifiedUser", { username })
            : t("unverified", { username })
      }
    >
      <Icon className={cn("shrink-0", icon)} aria-hidden />
      <span className="truncate">{username ?? t("none")}</span>
      {verified && <Check className={cn("shrink-0", icon)} aria-hidden />}
    </p>
  );
}
