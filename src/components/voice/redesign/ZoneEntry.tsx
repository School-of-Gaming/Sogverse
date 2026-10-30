"use client";

import type { ReactNode, Ref } from "react";
import { Lock, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { Locked } from "@/components/ui/locked-control";
import { cn } from "@/lib/cn";
import type { VoiceZoneView } from "@/lib/voice/zone-composition";
import { PrivacyScreen } from "../PrivacyScreen";
import { LockedZoneManage } from "../ZoneList";

/** A custom zone's edit and delete controls, working or locked. */
export type ZoneManage = { onEdit: () => void; onDelete: () => void } | Locked;

/**
 * One zone in the list both layouts show: its icon, name, how many people are
 * in it, and its members in a strip.
 *
 * **The strip's height is reserved whether anyone is in the zone or not**, so
 * people moving between zones never changes an entry's height and the entries
 * below stay put. Two rows are shown, and a crowd past that scrolls inside the
 * strip rather than growing it.
 */
export function ZoneEntry({
  zone,
  label,
  count,
  isCurrent,
  isDropTarget = false,
  onEnter,
  manage,
  rootRef,
  children,
}: {
  zone: VoiceZoneView;
  label: string;
  count: number;
  isCurrent: boolean;
  isDropTarget?: boolean;
  /** Absent when this is not a zone the reader can tap their way into. */
  onEnter?: () => void;
  manage?: ZoneManage;
  rootRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  const t = useTranslations("voice");
  const Icon = zone.icon;
  const accessibleLabel = label || t("unnamedZone");
  const outsiderOfLocked = zone.isLocked && !isCurrent;

  return (
    <div
      ref={rootRef}
      role={onEnter ? "button" : undefined}
      tabIndex={onEnter ? 0 : undefined}
      onClick={onEnter}
      onKeyDown={(e) => {
        if (!onEnter) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEnter();
        }
      }}
      aria-label={onEnter ? t("joinZone", { zone: accessibleLabel }) : undefined}
      aria-current={isCurrent ? "true" : undefined}
      className={cn(
        "rounded-xl border border-border p-2 transition-colors",
        isCurrent && zone.color.glow,
        isDropTarget && "ring-2 ring-act bg-lifted",
        onEnter &&
          "cursor-pointer hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border bg-lifted",
            zone.color.edge,
          )}
        >
          <Icon className={cn("h-4 w-4", zone.color.glyph)} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count}</span>
        {zone.isLocked && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-lifted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            <Lock className="h-2.5 w-2.5" aria-hidden />
            {t("privateZone")}
          </span>
        )}
        {manage && "locked" in manage && <LockedZoneManage explanation={manage.locked} />}
        {manage && !("locked" in manage) && (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                manage.onEdit();
              }}
              title={t("editZone")}
              aria-label={t("editZone")}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                manage.onDelete();
              }}
              title={t("deleteZoneConfirm")}
              aria-label={t("deleteZoneConfirm")}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {isCurrent && (
        <p className="sr-only">{t("stage.youAreHere")}</p>
      )}

      <div className="relative mt-1.5 h-[3.75rem]">
        <div className="flex h-full flex-wrap content-start gap-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {children}
        </div>
        {outsiderOfLocked && count > 0 && <PrivacyScreen />}
      </div>
    </div>
  );
}
