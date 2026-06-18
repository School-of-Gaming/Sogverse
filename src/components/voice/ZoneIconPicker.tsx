"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { VOICE_ZONE_ICONS, VOICE_ZONE_ICON_KEYS } from "@/lib/constants/voice-zones";
import type { ZoneColorClasses } from "@/lib/constants/voice-zones";
import type { VoiceZoneIcon } from "@/types";

/** Grid picker for the custom-zone icons. The selected icon previews the chosen
 *  color exactly as it appears on an active zone card — the color's soft tile,
 *  glyph color, high-contrast border and inset glow — so picking an icon and a
 *  color together shows the finished zone, not an abstract "primary" highlight. */
export function ZoneIconPicker({
  value,
  color,
  onChange,
}: {
  value: VoiceZoneIcon;
  color: ZoneColorClasses;
  onChange: (value: VoiceZoneIcon) => void;
}) {
  const t = useTranslations("voice.zoneIcon");
  return (
    <div className="grid grid-cols-8 gap-2">
      {VOICE_ZONE_ICON_KEYS.map((key) => {
        const Icon = VOICE_ZONE_ICONS[key];
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
              "flex h-9 w-9 items-center justify-center rounded-lg border transition-colors",
              selected
                ? cn("border-foreground", color.tile, color.glow)
                : "border-border hover:bg-accent",
            )}
          >
            <Icon className={cn("h-5 w-5", selected && color.glyph)} />
          </button>
        );
      })}
    </div>
  );
}
