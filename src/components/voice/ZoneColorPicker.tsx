"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { VOICE_ZONE_COLORS, VOICE_ZONE_COLOR_KEYS } from "@/lib/constants/voice-zones";
import type { VoiceZoneColor } from "@/types";

/** Grid picker for the 16 custom-zone colors (2 rows of 8). Each swatch shows
 *  the full-saturation `solid` fill so the palette reads vibrant — the muted
 *  soft-tint is only how the color appears once it's on a zone card. */
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
            // Same box model as ZoneIconPicker (`h-9 w-9 … border`) so the two
            // grids line up exactly: selection is the check glyph inside the
            // square, never a ring-offset/scale that would grow the square past
            // the icon tiles.
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg border border-border transition-colors",
              color.solid,
            )}
          >
            {/* White check reads on every swatch thanks to the drop shadow. */}
            {selected && (
              <Check className="h-4 w-4 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.55)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
