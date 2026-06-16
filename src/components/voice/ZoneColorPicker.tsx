"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { VOICE_ZONE_COLORS, VOICE_ZONE_COLOR_KEYS } from "@/lib/constants/voice-zones";
import type { VoiceZoneColor } from "@/types";

/** Grid picker for the 8 custom-zone colors (the avatar palette tints). */
export function ZoneColorPicker({
  value,
  onChange,
}: {
  value: VoiceZoneColor;
  onChange: (value: VoiceZoneColor) => void;
}) {
  const t = useTranslations("voice.zoneColor");
  return (
    <div className="grid grid-cols-8 gap-2">
      {VOICE_ZONE_COLOR_KEYS.map((key) => {
        const color = VOICE_ZONE_COLORS[key];
        const selected = key === value;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            title={t(key)}
            aria-label={t(key)}
            aria-pressed={selected}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg border-2 transition-colors",
              color.tile,
              selected ? color.ring.replace("ring-", "border-") : "border-transparent",
            )}
          >
            {selected && <Check className={cn("h-4 w-4", color.glyph)} />}
          </button>
        );
      })}
    </div>
  );
}
