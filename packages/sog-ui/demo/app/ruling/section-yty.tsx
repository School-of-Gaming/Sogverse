/**
 * Question 1 — the four Yty families.
 *
 * Three columns per element, because the middle one has never been on screen:
 * Sogverse's stylesheet carried an unlayered `* { border-color }` rule that
 * outranked every `border-*` utility, so the authored `border-yty-harmony/30`
 * always drew grey. The left column is what a reader has been looking at, the
 * middle is what the code has always said, and the right is the proposal.
 *
 * Today each hue is spent at alpha steps — 10% for the tile, 30% for the edge,
 * the hue itself as text and ring. Those steps are drawn with a real `rgb()`
 * alpha rather than a pre-mixed hex, so what is on screen is what the browser
 * composites and the dulling is visible rather than asserted.
 *
 * The proposed recipe is the one the library's grammar implies: a neutral
 * ground, the strong variant at full value on the edge and the ring, the soft
 * variant carrying ink and glyph. Nothing arrives at a fraction of itself.
 *
 * The zone tile is the second surface spending these hues, at 15%. Its border
 * is not part of the border bug — an active zone is marked with the neutral ink
 * edge and an inset glow — so two columns are enough there.
 */

import {
  Case,
  Compare,
  Exemplar,
  Glyph,
  Panel,
  Question,
  CARD,
  EDGE,
  GROUND,
  INK,
  MUTED_INK,
  type GlyphName,
} from "./parts";
import { alpha } from "./colour";
import { YTY_ROWS } from "./inventory";

const ELEMENT_GLYPH: Record<string, GlyphName> = {
  harmony: "heart",
  glow: "sun",
  valor: "sword",
  wit: "brain",
};

/**
 * The element card as `about/yty-section.tsx` composes it: a two-pixel border,
 * a 48px tile holding the glyph, the name at card-title size and the
 * description in the element's own colour underneath.
 */
function ElementCard({
  name,
  description,
  glyph,
  edge,
  tile,
  glyphColour,
  accent,
}: {
  name: string;
  description: string;
  glyph: GlyphName;
  edge: string;
  tile: string;
  glyphColour: string;
  accent: string;
}) {
  return (
    <div
      className="rounded-lg border-2 p-4"
      style={{ borderColor: edge, backgroundColor: CARD }}
    >
      <div className="flex items-center gap-4">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: tile }}
        >
          <Glyph name={glyph} size={24} colour={glyphColour} />
        </span>
        <span className="min-w-0">
          <span className="block text-h4 font-semibold" style={{ color: INK }}>
            {name}
          </span>
          <span className="block text-body-s" style={{ color: accent }}>
            {description}
          </span>
        </span>
      </div>
    </div>
  );
}

/** The zone card as `voice/ZoneList.tsx` composes it: a 36px tile, a glyph and a label. */
function ZoneTile({
  label,
  glyph,
  edge,
  tile,
  glyphColour,
}: {
  label: string;
  glyph: GlyphName;
  edge: string;
  tile: string;
  glyphColour: string;
}) {
  return (
    <div
      className="rounded-xl border px-3 py-2.5"
      style={{ borderColor: edge, backgroundColor: CARD }}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: tile }}
        >
          <Glyph name={glyph} size={20} colour={glyphColour} />
        </span>
        <span className="text-body-s" style={{ color: INK }}>
          {label}
        </span>
      </div>
    </div>
  );
}

export function YtySection() {
  return (
    <Question n={1} title="The four Yty families">
      {YTY_ROWS.map((family) => {
        const glyph = ELEMENT_GLYPH[family.id];
        return (
          <Case key={family.id} title={family.name}>
            <Compare columns={3}>
              <Panel label="Today, as rendered">
                <Exemplar
                  file="about/yty-section.tsx"
                  page="/about, the Four Yty-Elements grid"
                >
                  <ElementCard
                    name={family.name}
                    description={family.description}
                    glyph={glyph}
                    edge={EDGE}
                    tile={alpha(family.today, 0.1)}
                    glyphColour={family.today}
                    accent={family.today}
                  />
                </Exemplar>
              </Panel>

              <Panel label="Today, as authored">
                <Exemplar
                  file="about/yty-section.tsx"
                  page="the same card, with its authored edge"
                >
                  <ElementCard
                    name={family.name}
                    description={family.description}
                    glyph={glyph}
                    edge={alpha(family.today, 0.3)}
                    tile={alpha(family.today, 0.1)}
                    glyphColour={family.today}
                    accent={family.today}
                  />
                </Exemplar>
              </Panel>

              <Panel label="Proposed">
                <Exemplar
                  file="about/yty-section.tsx"
                  page="the same card, on the no-alpha recipe"
                >
                  <ElementCard
                    name={family.name}
                    description={family.description}
                    glyph={glyph}
                    edge={family.strong}
                    tile={GROUND}
                    glyphColour={family.soft}
                    accent={family.soft}
                  />
                </Exemplar>
              </Panel>
            </Compare>
          </Case>
        );
      })}

      <Case title="The voice-zone tile">
        <Compare columns={2}>
          <Panel label="Today">
            <Exemplar
              file="voice/ZoneList.tsx with lib/constants/voice-zones.ts"
              page="a club's voice room — the zone list"
            >
              <div className="space-y-2">
                {YTY_ROWS.map((family) => (
                  <ZoneTile
                    key={family.id}
                    label={family.name}
                    glyph={ELEMENT_GLYPH[family.id]}
                    edge={EDGE}
                    tile={alpha(family.today, 0.15)}
                    glyphColour={family.today}
                  />
                ))}
                <ZoneTile
                  label="Clubhouse"
                  glyph="home"
                  edge={INK}
                  tile={alpha(INK, 0.1)}
                  glyphColour={INK}
                />
              </div>
            </Exemplar>
          </Panel>

          <Panel label="Proposed">
            <Exemplar
              file="voice/ZoneList.tsx with lib/constants/voice-zones.ts"
              page="the same zone list, on the no-alpha recipe"
            >
              <div className="space-y-2">
                {YTY_ROWS.map((family) => (
                  <ZoneTile
                    key={family.id}
                    label={family.name}
                    glyph={ELEMENT_GLYPH[family.id]}
                    edge={family.strong}
                    tile={GROUND}
                    glyphColour={family.soft}
                  />
                ))}
                <ZoneTile
                  label="Clubhouse"
                  glyph="home"
                  edge={MUTED_INK}
                  tile={GROUND}
                  glyphColour={INK}
                />
              </div>
            </Exemplar>
          </Panel>
        </Compare>
      </Case>
    </Question>
  );
}
