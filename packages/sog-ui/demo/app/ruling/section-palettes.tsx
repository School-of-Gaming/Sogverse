/**
 * Question 4 — the categorical palettes.
 *
 * **Product types are ruled.** The four categorical colours are dropped; a
 * product kind is a fact and takes a Yty family — camp → Valor, consumer club →
 * Harmony, municipality club → Wit, event → Glow. The three admin constructs
 * that spend the type colour are drawn below with today's four hexes and again
 * with the mapped families, so the mapping can be confirmed on the thing before
 * it lands. The reasoning behind each row is in the doc comment on
 * `PRODUCT_FAMILY` in `inventory.ts`.
 *
 * Strong and soft follow the standing rule: the glyph is soft, and the key
 * rail's tile derives from strong at chip scale, which is the one alpha-step
 * exemption the library names. Today's column composites its hex the same way,
 * so the two tiles are drawn at the same strength and only the hue differs.
 *
 * The proposed column is written in real theme classes rather than inline
 * styles, because the Yty families are the library's own tokens — what is on
 * screen there is what the app would paint. Today's four are not tokens any
 * more, so they stay inline.
 *
 * **The zone palette is still open.** Sixteen distinguishable hues is a
 * gamer-facing requirement rather than a meaning, so it stays a named palette
 * and is ruled separately. The hue strip is there for that question: brand,
 * families, voice zones and both status sets, ordered by hue, so a
 * near-collision is adjacent rather than remembered. The product types have
 * left the strip because they are no longer colours the product spends.
 */

import type { ReactNode } from "react";
import { BRAND, YTY_FAMILIES } from "../../../src/tokens/brand";
import { alpha, hueOf } from "./colour";
import {
  PRODUCT_FAMILY,
  PRODUCT_PALETTE,
  STATUS_ROWS,
  ZONE_PALETTE,
} from "./inventory";
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
  Panel,
  Question,
  type GlyphName,
} from "./parts";

/** The glyph each type wears, the same mark in both columns. */
const PRODUCT_GLYPH: Record<string, GlyphName> = {
  "product-consumer-club": "gamepad",
  "product-municipality-club": "school",
  "product-camp": "tent",
  "product-event": "calendar",
};

/** The plural the key rail shows, and a product name for the row and the chip. */
const PRODUCT_COPY: Record<string, { plural: string; name: string }> = {
  "product-consumer-club": {
    plural: "Consumer clubs",
    name: "Minecraft club — Espoo",
  },
  "product-municipality-club": {
    plural: "Municipality clubs",
    name: "School club — Kirkkonummi",
  },
  "product-camp": { plural: "Camps", name: "Summer camp — Espoo" },
  "product-event": { plural: "Events", name: "Roblox launch event" },
};

/**
 * The mapped family's classes, spelled out per type.
 *
 * Literal strings rather than one assembled from the family id: Tailwind scans
 * source text, so a class built at render time is a class the stylesheet does
 * not contain. `bg-*-strong/15` is the chip-scale icon-accent tile the library's
 * alpha ban exempts, and it is the only alpha step here.
 */
const FAMILY_CLASSES: Record<string, { tile: string; glyph: string }> = {
  "product-consumer-club": {
    tile: "bg-yty-harmony-strong/15",
    glyph: "text-yty-harmony-soft",
  },
  "product-municipality-club": {
    tile: "bg-yty-wit-strong/15",
    glyph: "text-yty-wit-soft",
  },
  "product-camp": {
    tile: "bg-yty-valor-strong/15",
    glyph: "text-yty-valor-soft",
  },
  "product-event": {
    tile: "bg-yty-glow-strong/15",
    glyph: "text-yty-glow-soft",
  },
};

/** The soft hex of the family a type maps to, for the swatch row. */
function softOf(token: string): string {
  const family = PRODUCT_FAMILY[token];
  return family === "harmony"
    ? YTY_FAMILIES.harmony.soft
    : family === "glow"
      ? YTY_FAMILIES.glow.soft
      : family === "valor"
        ? YTY_FAMILIES.valor.soft
        : YTY_FAMILIES.wit.soft;
}

/** The strong hex of the family a type maps to, for the swatch row. */
function strongOf(token: string): string {
  const family = PRODUCT_FAMILY[token];
  return family === "harmony"
    ? YTY_FAMILIES.harmony.strong
    : family === "glow"
      ? YTY_FAMILIES.glow.strong
      : family === "valor"
        ? YTY_FAMILIES.valor.strong
        : YTY_FAMILIES.wit.strong;
}

// ------------------------------------------------------------- the key rail

/**
 * `admin/dashboard/product-type-key-rail.tsx` — the legend that teaches the
 * convention. The tile is the swatch and the glyph is the icon, in one mark.
 */
function KeyRail({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Product types
      </h4>
      <ul className="flex flex-wrap gap-x-4 gap-y-2 xl:flex-col xl:gap-2">
        {children}
      </ul>
    </div>
  );
}

function KeyRailItemToday({ token }: { token: string }) {
  const entry = PRODUCT_PALETTE.find((row) => row.token === token);
  const hex = entry === undefined ? INK : entry.hex;
  return (
    <li className="flex items-center gap-2 text-xs leading-tight">
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md"
        style={{ backgroundColor: alpha(hex, 0.15) }}
      >
        <Glyph name={PRODUCT_GLYPH[token]} size={16} colour={hex} />
      </span>
      <span className="min-w-0">{PRODUCT_COPY[token].plural}</span>
    </li>
  );
}

function KeyRailItemProposed({ token }: { token: string }) {
  const classes = FAMILY_CLASSES[token];
  return (
    <li className="flex items-center gap-2 text-xs leading-tight">
      <span
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${classes.tile}`}
      >
        <span className={classes.glyph}>
          <Glyph name={PRODUCT_GLYPH[token]} size={16} colour="currentColor" />
        </span>
      </span>
      <span className="min-w-0">{PRODUCT_COPY[token].plural}</span>
    </li>
  );
}

// -------------------------------------------------------- the attention card

const ISSUES = ["2 unplaced gamers", "1 seat unpaid"];

/**
 * `admin/dashboard/product-attention-grid.tsx` — a product card. The type glyph
 * is the only colour on it, beside the product's name.
 */
function AttentionCard({
  glyph,
  name,
}: {
  glyph: ReactNode;
  name: string;
}) {
  return (
    <div className="flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <span className="flex items-start gap-2">
        {glyph}
        <span className="text-sm leading-snug font-medium">{name}</span>
      </span>
      <ul className="space-y-1">
        {ISSUES.map((issue) => (
          <li key={issue} className="text-xs text-muted-foreground">
            {issue}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------ the week chip

/**
 * `admin/dashboard/week-rows.tsx` — a session chip in the schedule. The type is
 * one mark rather than two: the sidebar's glyph for that type, tinted.
 */
function SessionChip({
  glyph,
  name,
}: {
  glyph: ReactNode;
  name: string;
}) {
  return (
    <span className="flex items-center gap-1.5 rounded border border-border py-1 pr-2 pl-1.5 text-xs leading-tight">
      {glyph}
      <span className="shrink-0 font-medium text-muted-foreground tabular-nums">
        17:00
      </span>
      <span className="whitespace-nowrap">{name}</span>
    </span>
  );
}

// ------------------------------------------------------------------- strip

interface StripEntry {
  readonly hex: string;
  readonly label: string;
  readonly source: string;
}

const STRIP: readonly StripEntry[] = [
  { hex: BRAND.primary.hex, label: BRAND.primary.name, source: "brand" },
  { hex: BRAND.secondary.hex, label: BRAND.secondary.name, source: "brand" },
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
    <Question n={4} title="The categorical palettes">
      <Case title="Product types">
        <Compare columns={2}>
          <Panel label="Today — four categorical hexes">
            <div className="space-y-6">
              <Exemplar
                file="admin/dashboard/product-type-key-rail.tsx"
                page="/admin, the key rail beside the dashboard"
              >
                <KeyRail>
                  {PRODUCT_PALETTE.map((entry) => (
                    <KeyRailItemToday key={entry.token} token={entry.token} />
                  ))}
                </KeyRail>
              </Exemplar>

              <Exemplar
                file="admin/dashboard/product-attention-grid.tsx"
                page="/admin, the products needing attention"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  {PRODUCT_PALETTE.map((entry) => (
                    <AttentionCard
                      key={entry.token}
                      name={PRODUCT_COPY[entry.token].name}
                      glyph={
                        <Glyph
                          name={PRODUCT_GLYPH[entry.token]}
                          size={16}
                          colour={entry.hex}
                        />
                      }
                    />
                  ))}
                </div>
              </Exemplar>

              <Exemplar
                file="admin/dashboard/week-rows.tsx"
                page="/admin, a week row in the schedule"
              >
                <div className="flex flex-wrap gap-2">
                  {PRODUCT_PALETTE.map((entry) => (
                    <SessionChip
                      key={entry.token}
                      name={PRODUCT_COPY[entry.token].name}
                      glyph={
                        <Glyph
                          name={PRODUCT_GLYPH[entry.token]}
                          size={14}
                          colour={entry.hex}
                        />
                      }
                    />
                  ))}
                </div>
              </Exemplar>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {PRODUCT_PALETTE.map((entry) => (
                  <div key={entry.token}>
                    <div
                      className="h-12 rounded border border-border"
                      style={{ backgroundColor: entry.hex }}
                    />
                    <p className="mt-1 text-body-s">{entry.label}</p>
                    <p className="font-brand-mono text-body-s text-muted-foreground">
                      {entry.hex}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <Panel label="Proposed — a Yty family per kind">
            <div className="space-y-6">
              <Exemplar
                file="admin/dashboard/product-type-key-rail.tsx"
                page="the same key rail, on the mapped families"
              >
                <KeyRail>
                  {PRODUCT_PALETTE.map((entry) => (
                    <KeyRailItemProposed key={entry.token} token={entry.token} />
                  ))}
                </KeyRail>
              </Exemplar>

              <Exemplar
                file="admin/dashboard/product-attention-grid.tsx"
                page="the same cards, with the glyph in the family's soft variant"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  {PRODUCT_PALETTE.map((entry) => (
                    <AttentionCard
                      key={entry.token}
                      name={PRODUCT_COPY[entry.token].name}
                      glyph={
                        <span className={FAMILY_CLASSES[entry.token].glyph}>
                          <Glyph
                            name={PRODUCT_GLYPH[entry.token]}
                            size={16}
                            colour="currentColor"
                          />
                        </span>
                      }
                    />
                  ))}
                </div>
              </Exemplar>

              <Exemplar
                file="admin/dashboard/week-rows.tsx"
                page="the same chips, with the glyph in the family's soft variant"
              >
                <div className="flex flex-wrap gap-2">
                  {PRODUCT_PALETTE.map((entry) => (
                    <SessionChip
                      key={entry.token}
                      name={PRODUCT_COPY[entry.token].name}
                      glyph={
                        <span className={FAMILY_CLASSES[entry.token].glyph}>
                          <Glyph
                            name={PRODUCT_GLYPH[entry.token]}
                            size={14}
                            colour="currentColor"
                          />
                        </span>
                      }
                    />
                  ))}
                </div>
              </Exemplar>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {PRODUCT_PALETTE.map((entry) => (
                  <div key={entry.token}>
                    <div
                      className="h-12 rounded border border-border"
                      style={{ backgroundColor: strongOf(entry.token) }}
                    />
                    <div
                      className="mt-1 h-6 rounded border border-border"
                      style={{ backgroundColor: softOf(entry.token) }}
                    />
                    <p className="mt-1 text-body-s">{entry.label}</p>
                    <p className="font-brand-mono text-body-s text-muted-foreground">
                      {`yty-${PRODUCT_FAMILY[entry.token]}`}
                    </p>
                  </div>
                ))}
              </div>
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
