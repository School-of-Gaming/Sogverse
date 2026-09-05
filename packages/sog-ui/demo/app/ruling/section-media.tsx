/**
 * Questions 5, 6 and 7 — the colours with no token behind them.
 *
 * The constructs Sogverse spells inline because the palette has no word for
 * them: a scrim over a page, ink that has to read on a photograph or a
 * saturated swatch, true black behind video, and the three colours the
 * identicon draws itself from. They are real and they are not going away, so
 * the proposal is that the library name them rather than that the pages stop
 * using them. The reasoning is in the doc comment on `LOOSE_COLOURS`.
 *
 * Two things are drawn rather than measured. The scrim is drawn over a
 * deliberately bright layer, because a scrim's job is hardest over the
 * brightest thing under it, and the on-media ink is drawn there rather than
 * quoted. The zone picker's check is drawn white and then dark on the same
 * light swatches: white fails the glyph floor on the lighter entries and is
 * rescued in the app by a drop shadow, and that is easier to see than to say.
 *
 * The seventh question is different in kind and its answer is one swatch: the
 * cyan in the OG marks is a partner's mark colour, not our logo's.
 */

import { BRAND, NEUTRALS } from "../../../src/tokens/brand";
import { alpha } from "./colour";
import { IDENTICON_IDS, LOOSE_COLOURS } from "./inventory";
import {
  CARD,
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
  Swatch,
} from "./parts";

const BLACK = "#000000";
const WHITE = "#FFFFFF";
const LYNX_CYAN = "#009FE3";

/** The two opacities the app uses today, and the one opacity the library would own. */
const SCRIM_TODAY_DIALOG = 0.5;
const SCRIM_TODAY_TILE = 0.6;
const SCRIM_PROPOSED = 0.55;

/** A page fragment for a scrim to sit over, bright on purpose. */
function UnderLayer() {
  return (
    <div className="absolute inset-0">
      <div className="h-1/2" style={{ backgroundColor: BRAND.primary.hex }} />
      <div className="h-1/2" style={{ backgroundColor: CARD }} />
    </div>
  );
}

/**
 * `ui/dialog.tsx` — the scrim is `bg-black/50` with a backdrop blur and the
 * panel is a card with the neutral border. The footer keeps the app's button
 * order: negative first in the DOM, affirmative last.
 */
function AppDialog({ opacity }: { opacity: number }) {
  return (
    <div className="relative h-56 overflow-hidden rounded-lg">
      <UnderLayer />
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ backgroundColor: alpha(BLACK, opacity) }}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          className="w-full max-w-sm rounded-lg border p-6 shadow-lg"
          style={{ backgroundColor: CARD, borderColor: EDGE }}
        >
          <p className="text-lg font-semibold" style={{ color: INK }}>
            Remove this seat?
          </p>
          <p className="mt-1.5 text-sm" style={{ color: MUTED_INK }}>
            Aino loses her place in Tuesday&rsquo;s club.
          </p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <span
              className="inline-flex h-10 items-center justify-center rounded-md border px-4 py-2 text-sm font-medium"
              style={{ borderColor: EDGE, color: INK }}
            >
              Cancel
            </span>
            <span
              className="inline-flex h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-medium shadow-sm"
              style={{ backgroundColor: "#EF4343", color: WHITE }}
            >
              Remove seat
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** `family/ProfileTiles.tsx` — a profile tile's busy state, ink over a scrim. */
function MediaTile({ opacity, ink }: { opacity: number; ink: string }) {
  return (
    <div
      className="relative h-40 w-full overflow-hidden rounded-lg border"
      style={{ borderColor: EDGE }}
    >
      <UnderLayer />
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-2"
        style={{ backgroundColor: alpha(BLACK, opacity) }}
      >
        <Glyph name="check" size={28} colour={ink} />
        <p className="text-body-s" style={{ color: ink }}>
          Switching to Aino
        </p>
      </div>
    </div>
  );
}

const LIGHT_SWATCHES = ["#F4504E", "#E8C21F", "#9FC92E", "#46CF5A", "#38B0F7"];

/** `voice/ZoneColorPicker.tsx` — the selected swatch's check, on the light entries. */
function PickerChecks({ ink }: { ink: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {LIGHT_SWATCHES.map((hex) => (
        <span
          key={hex}
          className="flex h-10 w-10 items-center justify-center rounded-md"
          style={{ backgroundColor: hex }}
        >
          <Glyph name="checkMark" size={18} colour={ink} />
        </span>
      ))}
    </div>
  );
}

export function ScrimSection() {
  return (
    <Question n={5} title="Scrim, and ink on media">
      <Case title="The dialog scrim">
        <Compare columns={3}>
          <Panel label="Today — black at 50%">
            <Exemplar file="ui/dialog.tsx" page="the confirm dialog, everywhere">
              <AppDialog opacity={SCRIM_TODAY_DIALOG} />
            </Exemplar>
          </Panel>
          <Panel label="Today — black at 60%">
            <Exemplar
              file="family/ProfileTiles.tsx"
              page="/parent, a profile tile mid-switch"
            >
              <AppDialog opacity={SCRIM_TODAY_TILE} />
            </Exemplar>
          </Panel>
          <Panel label="Proposed — one scrim">
            <Exemplar file="ui/dialog.tsx" page="the same dialog, at one opacity">
              <AppDialog opacity={SCRIM_PROPOSED} />
            </Exemplar>
          </Panel>
        </Compare>
      </Case>

      <Case title="Ink on media">
        <Compare columns={2}>
          <Panel label="Today — text-white">
            <div className="space-y-4">
              <Exemplar
                file="family/ProfileTiles.tsx"
                page="/parent, a profile tile mid-switch"
              >
                <MediaTile opacity={SCRIM_TODAY_TILE} ink={WHITE} />
              </Exemplar>
              <Exemplar
                file="voice/ZoneColorPicker.tsx"
                page="the zone appearance dialog, the selected swatch"
              >
                <PickerChecks ink={WHITE} />
              </Exemplar>
            </div>
          </Panel>
          <Panel label="Proposed — on-media ink, and a dark check on a light swatch">
            <div className="space-y-4">
              <Exemplar
                file="family/ProfileTiles.tsx"
                page="the same tile, over the named scrim"
              >
                <MediaTile opacity={SCRIM_PROPOSED} ink={WHITE} />
              </Exemplar>
              <Exemplar
                file="voice/ZoneColorPicker.tsx"
                page="the same swatches, with the check in ground"
              >
                <PickerChecks ink={GROUND} />
              </Exemplar>
            </div>
          </Panel>
        </Compare>
      </Case>

      <Case title="The media ground">
        <Compare columns={2}>
          <Panel label="Today — bg-black">
            <Exemplar
              file="voice/ScreenShareDisplay.tsx"
              page="a club's voice room, while a screen is shared"
            >
              <div
                className="flex h-40 items-center justify-center rounded-lg border"
                style={{ borderColor: EDGE, backgroundColor: BLACK }}
              >
                <p className="text-body-s" style={{ color: MUTED_INK }}>
                  Mikko is sharing their screen
                </p>
              </div>
            </Exemplar>
          </Panel>
          <Panel label="Proposed — a named neutral">
            <div className="grid gap-4 sm:grid-cols-2">
              <Swatch hex={BLACK} name="Media ground" />
              <Swatch
                hex={NEUTRALS.background.hex}
                name={NEUTRALS.background.name}
              />
            </div>
          </Panel>
        </Compare>
      </Case>
    </Question>
  );
}

// --------------------------------------------------------------- identicon

interface IdenticonData {
  readonly grid: readonly (readonly boolean[])[];
  readonly colours: readonly (readonly string[])[];
}

/**
 * The app's identicon, reproduced rather than imported.
 *
 * The demo does not depend on Sogverse, and the generator is fifteen lines of
 * pure arithmetic: a 5x3 half grid read out of the first two bytes of the id, a
 * per-cell colour indexed by the bytes after those, and a mirror to make it
 * symmetric. Taking the palette as an argument is the only change, and it is
 * the whole point — the two columns differ in nothing else.
 */
function identicon(id: string, palette: readonly string[]): IdenticonData {
  const hex = id.replace(/-/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(Number.parseInt(hex.substring(i, i + 2), 16));
  }
  const bits = (bytes[0] << 8) | bytes[1];

  const grid: boolean[][] = [];
  const colours: string[][] = [];
  for (let row = 0; row < 5; row++) {
    const halfOn: boolean[] = [];
    const halfColour: string[] = [];
    for (let col = 0; col < 3; col++) {
      const cell = row * 3 + col;
      halfOn.push(((bits >> cell) & 1) === 1);
      halfColour.push(palette[bytes[(2 + cell) % bytes.length] % palette.length]);
    }
    grid.push([halfOn[0], halfOn[1], halfOn[2], halfOn[1], halfOn[0]]);
    colours.push([
      halfColour[0],
      halfColour[1],
      halfColour[2],
      halfColour[1],
      halfColour[0],
    ]);
  }
  return { grid, colours };
}

function IdenticonSvg({
  id,
  palette,
  ground,
  size = 64,
}: {
  id: string;
  palette: readonly string[];
  ground: string;
  size?: number;
}) {
  const { grid, colours } = identicon(id, palette);
  const cell = size / 5;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <rect width={size} height={size} fill={ground} />
      {grid.map((row, y) =>
        row.map((on, x) =>
          on ? (
            <rect
              key={`${y}-${x}`}
              x={x * cell}
              y={y * cell}
              width={cell}
              height={cell}
              fill={colours[y][x]}
            />
          ) : null,
        ),
      )}
    </svg>
  );
}

const TODAY_PALETTE = [BRAND.primary.hex, BRAND.secondary.hex, WHITE];
const PROPOSED_PALETTE = [BRAND.primary.hex, BRAND.secondary.hex, INK];

/**
 * The avatars on the card they sit on, so the black square can be seen against
 * the surface it is darker than.
 */
function AvatarRow({
  palette,
  ground,
}: {
  palette: readonly string[];
  ground: string;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-4 rounded-lg border p-4"
      style={{ borderColor: EDGE, backgroundColor: CARD }}
    >
      {IDENTICON_IDS.map((id) => (
        <span
          key={id}
          className="overflow-hidden rounded-md border"
          style={{ borderColor: EDGE }}
        >
          <IdenticonSvg id={id} palette={palette} ground={ground} />
        </span>
      ))}
    </div>
  );
}

export function IdenticonSection() {
  return (
    <Question n={6} title="The identicon">
      <Compare columns={2}>
        <Panel label="Today — #FFFFFF on #000000">
          <Exemplar
            file="lib/identicon.ts with ui/identicon.tsx"
            page="every avatar without a photo — the voice room, the roster, the switcher"
          >
            <AvatarRow palette={TODAY_PALETTE} ground={BLACK} />
          </Exemplar>
        </Panel>
        <Panel label="Proposed — foreground on background">
          <Exemplar
            file="lib/identicon.ts with ui/identicon.tsx"
            page="the same avatars, drawn from tokens"
          >
            <AvatarRow palette={PROPOSED_PALETTE} ground={GROUND} />
          </Exemplar>
        </Panel>
      </Compare>
    </Question>
  );
}

// ------------------------------------------------------------------- cyan

const LYNX = LOOSE_COLOURS.find((colour) => colour.label === "Lynx cyan");

export function LynxSection() {
  return (
    <Question n={7} title="The cyan in the OG marks">
      <div className="grid max-w-2xl gap-4 sm:grid-cols-3">
        <Swatch
          hex={LYNX_CYAN}
          name="Lynx cyan"
          sub={LYNX === undefined ? undefined : LYNX.where}
        />
        <Swatch
          hex={BRAND.primary.hex}
          name={BRAND.primary.name}
          sub="og/marks.tsx, SogMark badge"
        />
        <Swatch
          hex={BRAND.primary.foreground}
          name="Ink on amber"
          sub="og/marks.tsx, SogMark lettering"
        />
      </div>
    </Question>
  );
}
