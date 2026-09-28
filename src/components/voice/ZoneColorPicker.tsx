"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { VOICE_ZONE_COLORS, VOICE_ZONE_COLOR_KEYS } from "@/lib/constants/voice-zones";
import type { VoiceZoneColor } from "@/types";

/** A colour is required: exactly one swatch is always chosen. */
interface RequiredColorProps {
  value: VoiceZoneColor;
  onChange: (value: VoiceZoneColor) => void;
  clearable?: false;
}

/** A colour is optional: choosing the chosen swatch again clears it to `null`. */
interface ClearableColorProps {
  value: VoiceZoneColor | null;
  onChange: (value: VoiceZoneColor | null) => void;
  clearable: true;
}

/** Grid picker for the 16 picks (2 rows of 8). Each swatch shows the
 *  full-saturation `solid` fill so the palette reads vibrant, and this is the
 *  one place that fill is drawn: on a zone card the pick is the lifted grey
 *  with an edge in the chosen colour, so a swatch here is a bigger, plainer
 *  statement of the same value rather than a preview of the tile.
 *
 *  **No swatch has a name.** A pick is what it looks like, not what it is
 *  called: a colour a person chooses for themselves means only "this one is
 *  mine", so there is nothing to name it after, and a name would be an opinion
 *  about the hue that no consumer may hold. The grid is one group labelled by
 *  the field around it ("Color"), each swatch with no label of its own, so
 *  assistive technology announces the group's name, the swatch's position in
 *  the set and whether it is chosen, and nothing more — the same information a
 *  sighted person gets from the grid. No tooltip, for the same reason.
 *
 *  **Where a colour is optional (`clearable`), the chosen swatch clears on a
 *  second press** — a voice zone, which always has a colour, never opts in.
 *  A radio cannot be unchecked by activating it, so a clearable grid is not a
 *  radio group: it is a group of toggle buttons (`aria-pressed`), at most one
 *  pressed, which is what a swatch that turns off on a press actually is. */
export function ZoneColorPicker({
  labelledBy,
  ...props
}: (RequiredColorProps | ClearableColorProps) & {
  /** Id of the field label that names the group — `Field`'s `labelId`. */
  labelledBy: string;
}) {
  const clearable = props.clearable === true;
  const choose = (key: VoiceZoneColor) => {
    if (props.clearable === true) props.onChange(key === props.value ? null : key);
    else props.onChange(key);
  };
  return (
    <div
      role={clearable ? "group" : "radiogroup"}
      aria-labelledby={labelledBy}
      className="grid grid-cols-8 gap-2"
    >
      {VOICE_ZONE_COLOR_KEYS.map((key) => {
        const color = VOICE_ZONE_COLORS[key];
        const selected = key === props.value;
        return (
          <button
            key={key}
            type="button"
            {...(clearable
              ? { "aria-pressed": selected }
              : { role: "radio", "aria-checked": selected })}
            onClick={() => choose(key)}
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
