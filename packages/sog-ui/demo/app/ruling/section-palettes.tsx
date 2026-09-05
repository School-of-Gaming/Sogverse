/**
 * Question 4 — the voice-zone palette.
 *
 * **Product types are landed.** The four categorical colours are gone; a
 * product kind is a fact and takes a Yty family, and the mapping — kind to
 * family and to glyph — is the first row of the library's tone grammar, with
 * the admin product-type presentation as its consumer. Nothing about it is on
 * this page any more.
 *
 * **The zone palette is still open.** Sixteen distinguishable hues is a
 * gamer-facing requirement rather than a meaning, so it stays a named palette
 * and is ruled on its own. The picker is drawn as the moderator meets it, and
 * the hue strip is there for the collision question: brand, families, voice
 * zones and both status sets, ordered by hue, so a near-collision is adjacent
 * rather than remembered.
 */

import { BRAND, YTY_FAMILIES } from "../../../src/tokens/brand";
import { alpha, hueOf } from "./colour";
import { STATUS_ROWS, ZONE_PALETTE } from "./inventory";
import {
  CARD,
  Caps,
  Case,
  EDGE,
  Exemplar,
  GROUND,
  Glyph,
  Question,
} from "./parts";

interface StripEntry {
  readonly hex: string;
  readonly label: string;
  readonly source: string;
}

const STRIP: readonly StripEntry[] = [
  { hex: BRAND.act.hex, label: BRAND.act.name, source: "brand" },
  { hex: BRAND.world.hex, label: BRAND.world.name, source: "brand" },
  ...Object.values(YTY_FAMILIES).flatMap((family) => [
    { hex: family.strong, label: `${family.name} strong`, source: "family" },
    { hex: family.soft, label: `${family.name} soft`, source: "family" },
  ]),
  ...ZONE_PALETTE.map((entry) => ({
    hex: entry.hex,
    label: entry.label,
    source: "voice zone",
  })),
  ...STATUS_ROWS.map((status) => ({
    hex: status.today,
    label: status.label,
    source: "status, today",
  })),
  ...STATUS_ROWS.map((status) => ({
    hex: status.candidate,
    label: status.label,
    source: "status, proposed",
  })),
];

const BY_HUE = [...STRIP].sort((a, b) => hueOf(a.hex) - hueOf(b.hex));

function StripTile({ entry }: { entry: StripEntry }) {
  return (
    <div className="w-28">
      <div
        className="h-14 rounded border border-border"
        style={{ backgroundColor: entry.hex }}
      />
      <p className="mt-1 text-body-s leading-tight">{entry.label}</p>
      <p className="font-brand-mono text-body-s leading-tight text-muted-foreground">
        {entry.hex}
      </p>
      <p className="text-body-s leading-tight text-muted-foreground">
        {entry.source}
      </p>
    </div>
  );
}

export function PalettesSection() {
  return (
    <Question n={4} title="The voice-zone palette">
      <Case title="The voice-zone picker">
        <Exemplar
          file="voice/ZoneColorPicker.tsx with lib/constants/voice-zones.ts"
          page="a club's voice room — the zone appearance dialog"
        >
          <div
            className="rounded-lg border p-4"
            style={{ borderColor: EDGE, backgroundColor: CARD }}
          >
            <div className="flex flex-wrap gap-2">
              {ZONE_PALETTE.map((entry) => (
                <span
                  key={entry.token}
                  className="h-10 w-10 rounded-md"
                  style={{ backgroundColor: entry.hex }}
                />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {ZONE_PALETTE.map((entry) => (
                <span
                  key={entry.token}
                  className="flex h-10 w-10 items-center justify-center rounded-md"
                  style={{ backgroundColor: alpha(entry.hex, 0.15) }}
                >
                  <Glyph name="gamepad" size={18} colour={entry.hex} />
                </span>
              ))}
            </div>
          </div>
        </Exemplar>
      </Case>

      <Case title="Every colour the product spends, ordered by hue">
        <div
          className="rounded-lg border p-4"
          style={{ borderColor: EDGE, backgroundColor: GROUND }}
        >
          <Caps>Brand · families · voice zones · status</Caps>
          <div className="mt-4 flex flex-wrap gap-3">
            {BY_HUE.map((entry) => (
              <StripTile
                key={`${entry.source}-${entry.label}-${entry.hex}`}
                entry={entry}
              />
            ))}
          </div>
        </div>
      </Case>
    </Question>
  );
}
