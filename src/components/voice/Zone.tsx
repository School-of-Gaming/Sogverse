"use client";

import { Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type ZoneRect,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  ZONE_COLORS,
} from "@/lib/constants/spatial";

interface ZoneProps {
  zone: ZoneRect;
  isActive: boolean;
}

export function Zone({ zone, isActive }: ZoneProps) {
  const colors = ZONE_COLORS[zone.id];
  const isBroadcast = zone.id === "broadcast";

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
          "absolute left-2 top-1 flex items-center gap-1 text-xs font-medium",
          colors.accent
        )}
      >
        {isBroadcast && <Megaphone className="h-3 w-3" />}
        {zone.label}
      </div>
    </div>
  );
}
