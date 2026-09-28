"use client";

import { Ban, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { VOICE_ZONE_COLORS, VOICE_ZONE_COLOR_KEYS } from "@/lib/constants/voice-zones";
import type { VoiceZoneColor } from "@/types";

/** A colour is required: the grid is the sixteen picks and nothing else. */
interface RequiredColorProps {
  value: VoiceZoneColor;
  onChange: (value: VoiceZoneColor) => void;
  noneLabel?: undefined;
}

/**
 * A colour is optional: "none" is the first choice, named by `noneLabel`, and
 * `null` is its value.
 */
interface OptionalColorProps {
  value: VoiceZoneColor | null;
  onChange: (value: VoiceZoneColor | null) => void;
  noneLabel: string;
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
 *  about the hue that no consumer may hold. The grid is one radio group
 *  labelled by the field around it ("Color"), each swatch a radio with no
 *  label of its own, so assistive technology announces the group's name, the
 *  swatch's position in the set and whether it is checked, and nothing more —
 *  the same information a sighted person gets from the grid. No tooltip, for
 *  the same reason.
 *
 *  **Where a colour is optional, "none" leads the group** — passing
 *  `noneLabel` opts in, and a voice zone, which always has a colour, never
 *  does. It is a column of its own, as tall as the two rows, so the sixteen keep
 *  their two rows of eight beside it. Unlike a swatch it is not a colour, so it
 *  does have a name, and a struck-through glyph in the neutral ink says it
 *  without words. */
export function ZoneColorPicker({
  labelledBy,
  ...props
}: (RequiredColorProps | OptionalColorProps) & {
  /** Id of the field label that names the group — `Field`'s `labelId`. */
  labelledBy: string;
}) {
  const withNone = props.noneLabel !== undefined;
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className={cn("grid gap-2", withNone ? "grid-cols-9" : "grid-cols-8")}
    >
      {props.noneLabel !== undefined && (
        <button
          type="button"
          role="radio"
          aria-checked={props.value === null}
          aria-label={props.noneLabel}
          onClick={() => props.onChange(null)}
          // The swatches' box model at twice the height, so it spans both
          // rows. Selection is the same check, below the glyph that names it.
          className="row-span-2 flex w-9 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-hover"
        >
          <Ban className="h-4 w-4" aria-hidden />
          <Check
            className={cn(
              "h-4 w-4 text-foreground",
              props.value !== null && "invisible",
            )}
            aria-hidden
          />
        </button>
      )}
      {VOICE_ZONE_COLOR_KEYS.map((key) => {
        const color = VOICE_ZONE_COLORS[key];
        const selected = key === props.value;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => props.onChange(key)}
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
