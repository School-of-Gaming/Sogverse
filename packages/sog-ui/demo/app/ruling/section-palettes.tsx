/**
 * Question 4 — the two categorical palettes.
 *
 * Neither palette is proposed to change. What is proposed is that the library
 * own them, so a fifth product type or a seventeenth zone colour is a decision
 * made in the foundations tier rather than a hex typed into a page.
 *
 * The strip at the end is the thing worth looking at: every colour the product
 * spends — brand, families, product types, voice zones, and both status sets —
 * ordered by hue, so two colours a few degrees apart land beside each other
 * instead of being compared from memory. No distance is quoted; adjacency is
 * the argument. Three to read first are the camp's lime against Glow's green,
 * the consumer club's cyan against Wit's soft blue, and the amber zone against
 * the brand amber and the warning colour.
 */

import { BRAND, YTY_FAMILIES } from "../../../src/tokens/brand";
import { alpha, hueOf } from "./colour";
import { PRODUCT_PALETTE, STATUS_ROWS, ZONE_PALETTE } from "./inventory";
import {
  CARD,
  Caps,
  Case,
  Compare,
  EDGE,
  Exemplar,
  GROUND,
  Glyph,
  INK,
  MUTED_INK,
  Panel,
  Question,
  type GlyphName,
} from "./parts";

const PRODUCT_GLYPH: Record<string, GlyphName> = {
  "product-consumer-club": "gamepad",
  "product-municipality-club": "school",
  "product-camp": "tent",
  "product-event": "calendar",
};

interface StripEntry {
  readonly hex: string;
  readonly label: string;
  readonly source: string;
}

/** Every colour the product spends, so the strip is a census rather than a sample. */
const STRIP: readonly StripEntry[] = [
  { hex: BRAND.primary.hex, label: BRAND.primary.name, source: "brand" },
  { hex: BRAND.secondary.hex, label: BRAND.secondary.name, source: "brand" },
  ...Object.values(YTY_FAMILIES).flatMap((family) => [
    { hex: family.strong, label: `${family.name} strong`, source: "family" },
    { hex: family.soft, label: `${family.name} soft`, source: "family" },
  ]),
  ...PRODUCT_PALETTE.map((entry) => ({
    hex: entry.hex,
    label: entry.label,
    source: "product type",
  })),
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
        className="h-14 rounded border"
        style={{ backgroundColor: entry.hex, borderColor: EDGE }}
      />
      <p className="mt-1 text-body-s leading-tight" style={{ color: INK }}>
        {entry.label}
      </p>
      <p
        className="font-brand-mono text-body-s leading-tight"
        style={{ color: MUTED_INK }}
      >
        {entry.hex}
      </p>
      <p className="text-body-s leading-tight" style={{ color: MUTED_INK }}>
        {entry.source}
      </p>
    </div>
  );
}

export function PalettesSection() {
  return (
    <Question n={4} title="The categorical palettes">
      <Case title="The product-type key">
        <Compare columns={2}>
          <Panel label="In use">
            <Exemplar
              file="admin/dashboard/product-type-presentation.ts"
              page="/admin, the product-type key"
            >
              <div
                className="rounded-lg border p-4"
                style={{ borderColor: EDGE, backgroundColor: CARD }}
              >
                <div className="flex flex-wrap gap-x-6 gap-y-3">
                  {PRODUCT_PALETTE.map((entry) => (
                    <span key={entry.token} className="flex items-center gap-2">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-md"
                        style={{ backgroundColor: alpha(entry.hex, 0.15) }}
                      >
                        <Glyph
                          name={PRODUCT_GLYPH[entry.token]}
                          size={16}
                          colour={entry.hex}
                        />
                      </span>
                      <span className="text-body-s" style={{ color: INK }}>
                        {entry.label}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            </Exemplar>
          </Panel>
          <Panel label="Proposed — admitted unchanged">
            <div className="grid grid-cols-2 gap-4">
              {PRODUCT_PALETTE.map((entry) => (
                <div key={entry.token}>
                  <div
                    className="h-12 rounded border"
                    style={{ backgroundColor: entry.hex, borderColor: EDGE }}
                  />
                  <p className="mt-1 text-body-s" style={{ color: INK }}>
                    {entry.label}
                  </p>
                  <p
                    className="font-brand-mono text-body-s"
                    style={{ color: MUTED_INK }}
                  >
                    {entry.hex}
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        </Compare>
      </Case>

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
          <Caps>Brand · families · product types · voice zones · status</Caps>
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
