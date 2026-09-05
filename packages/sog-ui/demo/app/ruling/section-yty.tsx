/**
 * Question 1 — how the Yty pair is spent.
 *
 * **The tokens are ruled and landed.** The eight hues, four strong and four
 * soft, are the library's, and Sogverse's four single-value `--color-yty-*` are
 * gone. What is left open is the recipe: how a surface spends the pair it has
 * been given.
 *
 * Two columns per construct. **Today** is what the app renders right now — the
 * pre-library recipe, pointed at the new hues but still spending them at alpha
 * steps: a tile at 10%, the soft variant as glyph and as ink, and a neutral
 * edge. Those steps are drawn with a real `rgb()` alpha rather than a pre-mixed
 * hex, so what is on screen is what the browser composites and the dulling is
 * visible rather than asserted.
 *
 * **Proposed** is the recipe the library's grammar implies: a neutral ground,
 * the strong variant at full value on the edge and the ring, the soft variant
 * carrying ink and glyph. Nothing arrives at a fraction of itself.
 *
 * No swatches here. The hues are the library's now, so a strip of them would be
 * a foundations floor drawn on a ruling page; what this question needs on screen
 * is the two constructs that spend them.
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
import { YTY_FAMILIES, type YtyFamilyId } from "../../../src/tokens/brand";

/**
 * The element card's real copy.
 *
 * The names come from the library; the one-line descriptions are the canonical
 * English the app renders from its message catalogue, which the library has no
 * word for and no reason to.
 */
const ELEMENTS: readonly {
  id: YtyFamilyId;
  description: string;
  glyph: GlyphName;
}[] = [
  {
    id: "harmony",
    description: "Your relationship with yourself",
    glyph: "heart",
  },
  { id: "glow", description: "Your relationship with others", glyph: "sun" },
  { id: "valor", description: "Your relationship with society", glyph: "sword" },
  { id: "wit", description: "Your relationship with technology", glyph: "brain" },
];

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
    <Question n={1} title="How a Yty family is spent">
      {ELEMENTS.map((element) => {
        const family = YTY_FAMILIES[element.id];
        return (
          <Case key={element.id} title={family.name}>
            <Compare columns={2}>
              <Panel label="Today">
                <Exemplar
                  file="about/yty-section.tsx"
                  page="/about, the Four Yty-Elements grid"
                >
                  <ElementCard
                    name={family.name}
                    description={element.description}
                    glyph={element.glyph}
                    edge={EDGE}
                    tile={alpha(family.strong, 0.1)}
                    glyphColour={family.soft}
                    accent={family.soft}
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
                    description={element.description}
                    glyph={element.glyph}
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
                {ELEMENTS.map((element) => (
                  <ZoneTile
                    key={element.id}
                    label={YTY_FAMILIES[element.id].name}
                    glyph={element.glyph}
                    edge={EDGE}
                    tile={alpha(YTY_FAMILIES[element.id].strong, 0.1)}
                    glyphColour={YTY_FAMILIES[element.id].soft}
                  />
                ))}
                <ZoneTile
                  label="Clubhouse"
                  glyph="home"
                  edge={EDGE}
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
                {ELEMENTS.map((element) => (
                  <ZoneTile
                    key={element.id}
                    label={YTY_FAMILIES[element.id].name}
                    glyph={element.glyph}
                    edge={YTY_FAMILIES[element.id].strong}
                    tile={GROUND}
                    glyphColour={YTY_FAMILIES[element.id].soft}
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
