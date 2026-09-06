/**
 * The colours with no token behind them.
 *
 * What is left here is the identicon: the three colours the avatar generator
 * draws itself from, which are real and are not going away, so the proposal is
 * that the library name them rather than that the pages stop using them. The
 * reasoning is in the doc comment on `LOOSE_COLOURS`.
 *
 * The scrim, the ink that reads on it, the picker's check and the media ground
 * have all been ruled and landed; the cyan in the OG marks was ruled a
 * partner's own mark colour. Their sections are stubs below until the pass that
 * unwires them.
 */

import { BRAND } from "../../../src/tokens/brand";
import { IDENTICON_IDS } from "./inventory";
import { CARD, Compare, EDGE, Exemplar, GROUND, INK, Panel, Question } from "./parts";

const BLACK = "#000000";
const WHITE = "#FFFFFF";

/** Ruled and landed: ink on media is the app's ink, the picker's check is drawn
 *  in ink, and the media ground is the card. The wiring goes in the next pass. */
export function ScrimSection() {
  return null;
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

const TODAY_PALETTE = [BRAND.act.hex, BRAND.world.hex, WHITE];
const PROPOSED_PALETTE = [BRAND.act.hex, BRAND.world.hex, INK];

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
    <Question n={2} title="The identicon">
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

/** Ruled and landed: a colour inside a partner's mark is the partner's, never a
 *  token. The wiring goes in the next pass. */
export function LynxSection() {
  return null;
}
