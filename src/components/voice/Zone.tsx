"use client";

import { Megaphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  type ZoneRect,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  ZONE_COLORS,
} from "@/lib/constants/spatial";
import { YTY_ELEMENTS } from "@/lib/constants/yty";

/** Map breakout zone ids to YTY element translation keys. */
const BREAKOUT_KEY = {
  breakout_1: `elements.${YTY_ELEMENTS[0].id}.name`,
  breakout_2: `elements.${YTY_ELEMENTS[1].id}.name`,
  breakout_3: `elements.${YTY_ELEMENTS[2].id}.name`,
  breakout_4: `elements.${YTY_ELEMENTS[3].id}.name`,
} as const;

interface ZoneProps {
  zone: ZoneRect;
  isActive: boolean;
}

export function Zone({ zone, isActive }: ZoneProps) {
  const voice = useTranslations("voice");
  const yty = useTranslations("yty");
  const colors = ZONE_COLORS[zone.id];
  const isBroadcast = zone.id === "broadcast";

  const label = isBroadcast
    ? voice("broadcast")
    : yty(BREAKOUT_KEY[zone.id as keyof typeof BREAKOUT_KEY]);

  return (
    <div
      className={cn(
        "absolute rounded-lg border-2 border-dashed transition-colors",
        colors.bg,
        colors.border,
        isActive && "ring-2 ring-primary/50"
      )}
      style={{
        left: `${(zone.x / CANVAS_WIDTH) * 100}%`,
        top: `${(zone.y / CANVAS_HEIGHT) * 100}%`,
        width: `${(zone.width / CANVAS_WIDTH) * 100}%`,
        height: `${(zone.height / CANVAS_HEIGHT) * 100}%`,
      }}
    >
      <div
        className={cn(
          "absolute flex items-center gap-1 font-medium",
          colors.accent,
          isBroadcast ? "left-0 right-0 top-1 justify-center text-xs" : "gap-2 text-sm",
          zone.id === "breakout_1" && "left-3 top-2",
          zone.id === "breakout_2" && "right-3 top-2 flex-row-reverse",
          zone.id === "breakout_3" && "left-3 bottom-2",
          zone.id === "breakout_4" && "right-3 bottom-2 flex-row-reverse",
        )}
      >
        {isBroadcast && <Megaphone className="h-3 w-3" />}
        {zone.icon && <zone.icon className="h-6 w-6" />}
        {label}
      </div>
    </div>
  );
}
