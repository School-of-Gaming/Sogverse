"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { VOICE_ZONE_ICONS, VOICE_ZONE_ICON_KEYS } from "@/lib/constants/voice-zones";
import type { VoiceZoneIcon } from "@/types";

/** Grid picker for the 8 custom-zone icons. */
export function ZoneIconPicker({
  value,
  onChange,
}: {
  value: VoiceZoneIcon;
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
              selected ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent",
            )}
          >
            <Icon className="h-5 w-5" />
          </button>
        );
      })}
    </div>
  );
}
