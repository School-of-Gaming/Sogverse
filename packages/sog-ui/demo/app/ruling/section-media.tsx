/**
 * Questions 5, 6 and 7 — the colours with no token behind them.
 *
 * These are the constructs Sogverse spells inline because the palette has no
 * word for them: a scrim over a page, ink that has to read on a photograph or a
 * saturated swatch, true black behind video, and the three colours the identicon
 * draws itself from. They are real and they are not going away, so the proposal
 * is that the library name them rather than that the pages stop using them.
 *
 * The seventh question is different in kind and its answer turned out to be
 * short: the cyan in the OG marks is not our logo's.
 */

import { BRAND, NEUTRALS } from "../../../src/tokens/brand";
import { alpha, over } from "./colour";
import { IDENTICON_IDS } from "./inventory";
import {
  CARD,
  Case,
  Compare,
  EDGE,
  GROUND,
  Glyph,
  INK,
  MUTED_INK,
  Note,
  Panel,
  Question,
  Ratio,
  Swatch,
} from "./parts";

const BLACK = "#000000";
const WHITE = "#FFFFFF";
const LYNX_CYAN = "#009FE3";

/** The two opacities the app uses today, and the one opacity the library would own. */
const SCRIM_TODAY_DIALOG = 0.5;
const SCRIM_TODAY_TILE = 0.6;
const SCRIM_PROPOSED = 0.55;

/**
 * A page fragment for a scrim to sit over — deliberately bright, because a
 * scrim's job is hardest over the brightest thing under it.
 */
function UnderLayer() {
  return (
    <div className="absolute inset-0">
      <div className="h-1/2" style={{ backgroundColor: BRAND.primary.hex }} />
      <div className="h-1/2" style={{ backgroundColor: CARD }} />
    </div>
  );
}

function OverlayDemo({
  opacity,
  ink,
  label,
}: {
  opacity: number;
  ink: string;
  label: string;
}) {
  return (
    <div
      className="relative h-48 overflow-hidden rounded-lg border"
      style={{ borderColor: EDGE }}
    >
      <UnderLayer />
      <div
        className="absolute inset-0"
        style={{ backgroundColor: alpha(BLACK, opacity) }}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          className="w-full max-w-xs rounded-lg border p-4"
          style={{ borderColor: EDGE, backgroundColor: CARD }}
        >
          <p className="text-h4" style={{ color: INK }}>
            Remove this seat?
          </p>
          <p className="mt-1 text-body-s" style={{ color: MUTED_INK }}>
            Aino loses her place in Tuesday&rsquo;s club.
          </p>
        </div>
      </div>
      <p
        className="absolute bottom-2 left-3 font-brand-mono text-body-s"
        style={{ color: ink }}
      >
        {label}
      </p>
    </div>
  );
}

function MediaTile({
  scrimOpacity,
  ink,
  caption,
}: {
  scrimOpacity: number;
  ink: string;
  caption: string;
}) {
  return (
    <div
      className="relative h-40 w-full overflow-hidden rounded-lg border"
      style={{ borderColor: EDGE }}
    >
      <UnderLayer />
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-2"
        style={{ backgroundColor: alpha(BLACK, scrimOpacity) }}
      >
        <Glyph name="check" size={28} colour={ink} />
        <p className="text-body-s" style={{ color: ink }}>
          {caption}
        </p>
      </div>
    </div>
  );
}

export function ScrimSection() {
  const overCard = over(BLACK, SCRIM_PROPOSED, CARD);
  const overAmber = over(BLACK, SCRIM_PROPOSED, BRAND.primary.hex);
  const overWhite = over(BLACK, SCRIM_PROPOSED, WHITE);
  return (
    <Question
      n={5}
      title="Scrim, and ink on media"
      asks="A scrim over a page, ink that has to read on a photograph or a saturated swatch, and true black behind a shared screen. The library has no word for any of the three. Do they enter as named neutrals — and at one opacity or two?"
    >
      <Case title="The overlay under a dialog">
        <Compare columns={2}>
          <Panel
            label="Today"
            sub="Two opacities for one construct: 50% under a dialog and a sheet, 60% on a busy profile tile."
          >
            <div className="space-y-4">
              <OverlayDemo
                opacity={SCRIM_TODAY_DIALOG}
                ink={WHITE}
                label="black at 50%"
              />
              <OverlayDemo
                opacity={SCRIM_TODAY_TILE}
                ink={WHITE}
                label="black at 60%"
              />
            </div>
          </Panel>
          <Panel
            label="Proposed"
            sub="One named scrim, one opacity, owned by the overlay primitive rather than typed per surface."
          >
            <OverlayDemo
              opacity={SCRIM_PROPOSED}
              ink={WHITE}
              label="scrim"
            />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Swatch hex={BLACK} name="Scrim" sub="drawn at one opacity" />
              <Swatch hex={WHITE} name="On-media ink" sub="the ink that survives a scrim" />
            </div>
          </Panel>
        </Compare>
      </Case>

      <Case title="Ink on media">
        <Compare columns={2}>
          <Panel label="Today" sub="text-white on a busy tile, and on a zone colour swatch.">
            <div className="space-y-4">
              <MediaTile
                scrimOpacity={SCRIM_TODAY_TILE}
                ink={WHITE}
                caption="Switching to Aino"
              />
              <div className="flex flex-wrap gap-2">
                {["#F4504E", "#E8C21F", "#46CF5A", "#38B0F7", "#C45FF2"].map(
                  (hex) => (
                    <span
                      key={hex}
                      className="flex h-10 w-10 items-center justify-center rounded-md"
                      style={{ backgroundColor: hex }}
                    >
                      <Glyph name="check" size={16} colour={WHITE} />
                    </span>
                  ),
                )}
              </div>
              <div className="space-y-1">
                <Ratio
                  what="white check on the yellow swatch"
                  foreground={WHITE}
                  background="#E8C21F"
                  use="glyph"
                />
                <Ratio
                  what="ink check on the yellow swatch"
                  foreground={INK}
                  background="#E8C21F"
                  use="glyph"
                />
                <Ratio
                  what="ground check on the yellow swatch"
                  foreground={GROUND}
                  background="#E8C21F"
                  use="glyph"
                />
              </div>
              <Note>
                The check on a light zone swatch is the case white does not
                solve: it fails the glyph floor on the lighter entries
                whichever way it is drawn, and the app leans on a drop shadow to
                rescue it. A dark check on a light swatch is the same decision
                the brand pair already makes for amber.
              </Note>
            </div>
          </Panel>
          <Panel
            label="Proposed"
            sub="On-media ink is a named neutral; a swatch takes ink or ground by the same rule a fill does."
          >
            <div className="space-y-4">
              <MediaTile
                scrimOpacity={SCRIM_PROPOSED}
                ink={WHITE}
                caption="Switching to Aino"
              />
              <div className="flex flex-wrap gap-2">
                {["#F4504E", "#E8C21F", "#46CF5A", "#38B0F7", "#C45FF2"].map(
                  (hex) => (
                    <span
                      key={hex}
                      className="flex h-10 w-10 items-center justify-center rounded-md"
                      style={{ backgroundColor: hex }}
                    >
                      <Glyph name="check" size={16} colour={GROUND} />
                    </span>
                  ),
                )}
              </div>
              <div className="space-y-1">
                <Ratio
                  what="on-media ink over the scrim, on a card"
                  foreground={WHITE}
                  background={overCard}
                  use="body"
                />
                <Ratio
                  what="on-media ink over the scrim, on amber"
                  foreground={WHITE}
                  background={overAmber}
                  use="body"
                />
                <Ratio
                  what="on-media ink over the scrim, on white"
                  foreground={WHITE}
                  background={overWhite}
                  use="body"
                />
                <Ratio
                  what="the app's own ink over the scrim, on white"
                  foreground={INK}
                  background={overWhite}
                  use="body"
                />
              </div>
              <Note>
                The last two measurements are the reason on-media ink is a
                separate token rather than the app&rsquo;s Ink reused: over the
                brightest thing a scrim can cover, one step down from white is
                the step that stops it clearing the floor.
              </Note>
            </div>
          </Panel>
        </Compare>
      </Case>

      <Case title="The media ground">
        <Compare columns={2}>
          <Panel label="Today" sub="bg-black behind a shared screen.">
            <div
              className="flex h-40 items-center justify-center rounded-lg border"
              style={{ borderColor: EDGE, backgroundColor: BLACK }}
            >
              <p className="text-body-s" style={{ color: MUTED_INK }}>
                Mikko is sharing their screen
              </p>
            </div>
          </Panel>
          <Panel
            label="Proposed"
            sub="A named neutral. True black is right behind video — it is what letterboxing should disappear into — and wrong as a page ground, which is why the library's Ground is not black."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Swatch hex={BLACK} name="Media ground" sub="behind video only" />
              <Swatch
                hex={NEUTRALS.background.hex}
                name={NEUTRALS.background.name}
                sub="everywhere else"
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
 * pure arithmetic: a 5x3 half grid read out of the first two bytes of the id,
 * a per-cell colour indexed by the bytes after those, and a mirror to make it
 * symmetric. Taking the palette as an argument is the only change, and it is
 * the whole point — the two columns below differ in nothing else.
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

export function IdenticonSection() {
  return (
    <Question
      n={6}
      title="The identicon"
      asks="An avatar is drawn from amber, violet and a third colour, on a fourth. Where do the third and the fourth come from — pure white and pure black, or the palette's Ink and Ground?"
    >
      <Compare columns={2}>
        <Panel
          label="Today"
          sub="Amber, violet and #FFFFFF on #000000. Neither of the last two is a token."
        >
          <div className="flex flex-wrap gap-4">
            {IDENTICON_IDS.map((id) => (
              <span
                key={id}
                className="overflow-hidden rounded-md border"
                style={{ borderColor: EDGE }}
              >
                <IdenticonSvg id={id} palette={TODAY_PALETTE} ground={BLACK} />
              </span>
            ))}
          </div>
          <div className="mt-4 space-y-1">
            <Ratio
              what="white cell on the black ground"
              foreground={WHITE}
              background={BLACK}
              use="glyph"
            />
            <Ratio
              what="violet cell on the black ground"
              foreground={BRAND.secondary.hex}
              background={BLACK}
              use="glyph"
            />
            <Ratio
              what="the black ground against the card it sits on"
              foreground={BLACK}
              background={CARD}
              use="glyph"
            />
          </div>
          <Note>
            The last measurement is the one that matters: on a card the avatar is
            a black square, darker than anything else on the page, and it reads
            as a hole rather than as a portrait.
          </Note>
        </Panel>
        <Panel
          label="Proposed"
          sub="Amber, violet and Ink on Ground. Every colour in the mark is then a token."
        >
          <div className="flex flex-wrap gap-4">
            {IDENTICON_IDS.map((id) => (
              <span
                key={id}
                className="overflow-hidden rounded-md border"
                style={{ borderColor: EDGE }}
              >
                <IdenticonSvg
                  id={id}
                  palette={PROPOSED_PALETTE}
                  ground={GROUND}
                />
              </span>
            ))}
          </div>
          <div className="mt-4 space-y-1">
            <Ratio
              what="ink cell on the ground"
              foreground={INK}
              background={GROUND}
              use="glyph"
            />
            <Ratio
              what="violet cell on the ground"
              foreground={BRAND.secondary.hex}
              background={GROUND}
              use="glyph"
            />
            <Ratio
              what="the ground against the card it sits on"
              foreground={GROUND}
              background={CARD}
              use="glyph"
            />
          </div>
          <Note>
            Violet against a near-black is the weak pairing either way — it is a
            dark colour on a dark ground, and it is below the glyph floor on
            both. That is a separate question from where the third colour comes
            from, and it is worth ruling on while the avatars are on screen.
          </Note>
        </Panel>
      </Compare>
    </Question>
  );
}

// ------------------------------------------------------------------- cyan

export function LynxSection() {
  return (
    <Question
      n={7}
      title="The cyan in the OG marks"
      asks="Should the cyan the Open Graph marks draw become a named brand colour? The answer is no, and it is not a close call — the mark carrying it is not ours."
    >
      <Note>
        The brief called this the logo&rsquo;s cyan. It is not: our own mark is
        already drawn in named tokens — the badge in amber, the lettering in the
        ink amber carries — and the only file spelling this colour draws the
        Lynx Educate wordmark, whom School of Gaming partners with. It is their
        brand colour, in their single supplied colourway, and recolouring or
        re-deriving a partner mark is precisely what the partner asset rules
        forbid. It stays a literal beside the mark it belongs to, where a
        reviewer can see it in a diff, and it must not enter the palette under
        any name.
      </Note>
      <div className="mt-6 grid max-w-2xl gap-4 sm:grid-cols-3">
        <Swatch hex={LYNX_CYAN} name="Lynx cyan" sub="a partner's, not ours" />
        <Swatch
          hex={BRAND.primary.hex}
          name={BRAND.primary.name}
          sub="the badge"
        />
        <Swatch
          hex={BRAND.primary.foreground}
          name="Ink on amber"
          sub="the lettering"
        />
      </div>
      <Note>
        The one thing worth ruling on here: the palette has no cyan of its own,
        and the product spends two — the consumer club&rsquo;s and the cyan
        voice zone&rsquo;s, which land beside each other in the hue strip above
        and are all but the same colour. If a cyan is ever wanted it is those two
        that should be reconciled, not this one adopted.
      </Note>
    </Question>
  );
}
