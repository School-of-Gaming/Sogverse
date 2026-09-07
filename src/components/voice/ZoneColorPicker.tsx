"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { VOICE_ZONE_COLORS, VOICE_ZONE_COLOR_KEYS } from "@/lib/constants/voice-zones";
import type { VoiceZoneColor } from "@/types";

/** Grid picker for the 16 picks (2 rows of 8). Each swatch shows the
 *  full-saturation `solid` fill so the palette reads vibrant — the muted
 *  soft-tint is only how the color appears once it's on a zone card.
 *
 *  **No swatch has a name.** A pick is what it looks like, not what it is
 *  called: a colour a person chooses for themselves means only "this one is
 *  mine", so there is nothing to name it after, and a name would be an opinion
 *  about the hue that no consumer may hold. The grid is one radio group
 *  labelled by the field around it ("Color"), each swatch a radio with no
 *  label of its own, so assistive technology announces the group's name, the
 *  swatch's position in the set and whether it is checked, and nothing more —
 *  the same information a sighted person gets from the grid. No tooltip, for
 *  the same reason. */
export function ZoneColorPicker({
  value,
  onChange,
  labelledBy,
}: {
  value: VoiceZoneColor;
  onChange: (value: VoiceZoneColor) => void;
  /** Id of the field label that names the group — `Field`'s `labelId`. */
  labelledBy: string;
}) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid grid-cols-8 gap-2">
      {VOICE_ZONE_COLOR_KEYS.map((key) => {
        const color = VOICE_ZONE_COLORS[key];
        const selected = key === value;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(key)}
            // Same box model as ZoneIconPicker (`h-9 w-9 … border`) so the two
            // grids line up exactly: selection is the check glyph inside the
            // square, never a ring-offset/scale that would grow the square past
            // the icon tiles.
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg border border-border transition-colors",
              color.solid,
            )}
          >
            {/* The check is drawn in ink, not in white: every pick is a light,
                saturated fill, so the mark that sits on one is the same dark
                the app puts on any light fill. `background` is that ink — the
                page ground's own value — rather than `act-foreground`, which
                names the ink belonging to the act fill and would be claiming
                a pairing these sixteen swatches are not part of. Ink on a light
                fill needs no drop shadow to be found; the shadow was there to
                rescue white, and white is gone. */}
            {selected && <Check className="h-4 w-4 text-background" />}
          </button>
        );
      })}
    </div>
  );
}
