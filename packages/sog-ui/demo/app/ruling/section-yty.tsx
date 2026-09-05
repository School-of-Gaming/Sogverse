/**
 * Question 1 — the four Yty families.
 *
 * Today each element is one hue, spent at four different alpha steps: a tile at
 * 10%, a gradient from 10% to 5%, a border at 30%, and the hue itself as text
 * and as a ring. The library bans the alpha step outright, because over a
 * near-black ground it composites to a darker, duller colour that is no longer
 * the brand — so the hex under each tint is drawn beside it here, computed the
 * way the browser composites it.
 *
 * The proposed recipe is what the library's grammar already implies: a neutral
 * ground, the strong variant at full value on the edge and the ring, and the
 * soft variant carrying ink and glyph. Nothing arrives at a fraction of itself.
 *
 * Two "today" columns, not one. Sogverse's stylesheet carries an unlayered
 * `* { border-color }` rule that outranks every `border-*` utility, so the
 * authored `border-yty-harmony/30` has never been drawn — every one of these
 * cards has shown a grey edge instead. The middle column is the code; the left
 * column is what a reader has actually been looking at.
 */

import {
  Case,
  Compare,
  Glyph,
  Note,
  Panel,
  Question,
  Ratio,
  CARD,
  EDGE,
  GROUND,
  INK,
  MUTED_INK,
  type GlyphName,
} from "./parts";
import { alpha, over } from "./colour";
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
  ground,
}: {
  label: string;
  glyph: GlyphName;
  edge: string;
  tile: string;
  glyphColour: string;
  ground: string;
}) {
  return (
    <div
      className="rounded-xl border px-3 py-2.5"
      style={{ borderColor: edge, backgroundColor: ground }}
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
    <Question
      n={1}
      title="The four Yty families"
      asks="Sogverse spends one hue per element at 5%, 10% and 30% alpha. The library spends a strong/soft pair at full value on a neutral ground. Which recipe do the element card and the voice-zone tile take — and does every element keep its hue, given that all four change hue family?"
    >
      <Note>
        Every element changes family, not shade: Harmony green to pink, Glow
        amber to green, Valor pink to orange, Wit violet to blue. Two of
        today&rsquo;s four are also collisions the library&rsquo;s set removes
        — today&rsquo;s Glow sits a few degrees from the brand amber, and
        today&rsquo;s Wit is a violet beside the brand&rsquo;s own violet.
      </Note>

      {YTY_ROWS.map((family) => {
        const glyph = ELEMENT_GLYPH[family.id];
        const todayTile = over(family.today, 0.1, CARD);
        const todayEdge = over(family.today, 0.3, CARD);
        return (
          <Case key={family.id} title={family.name}>
            <Compare columns={3}>
              <Panel
                label="Today, as the app renders it"
                sub="The authored border never wins; the grey one is drawn instead."
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
                <div className="mt-4 space-y-1">
                  <Ratio
                    what="description on card"
                    foreground={family.today}
                    background={CARD}
                    use="body"
                  />
                  <Ratio
                    what="glyph on the 10% tile"
                    foreground={family.today}
                    background={todayTile}
                    use="glyph"
                  />
                  <p className="font-brand-mono text-body-s text-muted-foreground">
                    {`tile composites to ${todayTile}`}
                  </p>
                </div>
              </Panel>

              <Panel
                label="Today, as authored"
                sub="Never rendered in the app until now — the border bug is fixed on this branch."
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
                <div className="mt-4 space-y-1">
                  <Ratio
                    what="edge on card"
                    foreground={todayEdge}
                    background={CARD}
                    use="glyph"
                  />
                  <p className="font-brand-mono text-body-s text-muted-foreground">
                    {`edge composites to ${todayEdge}`}
                  </p>
                </div>
              </Panel>

              <Panel
                label="Proposed"
                sub="Neutral ground, strong at full value on the edge, soft as ink."
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
                <div className="mt-4 space-y-1">
                  <Ratio
                    what="soft description on card"
                    foreground={family.soft}
                    background={CARD}
                    use="body"
                  />
                  <Ratio
                    what="soft glyph on the neutral tile"
                    foreground={family.soft}
                    background={GROUND}
                    use="glyph"
                  />
                  <Ratio
                    what="strong edge on card"
                    foreground={family.strong}
                    background={CARD}
                    use="glyph"
                  />
                </div>
              </Panel>
            </Compare>
          </Case>
        );
      })}

      <Case title="The voice-zone tile">
        <Note>
          The zone card is the second surface spending these hues, at 15% for the
          tile. Its border is not part of the border bug — an active zone is
          marked with the neutral ink edge and an inset glow, so what is drawn
          below is what a moderator sees. The proposal moves the tile to a
          neutral and puts the colour on the glyph and the edge at full value.
        </Note>
        <div className="mt-5">
          <Compare columns={2}>
            <Panel label="Today" sub="A 15% wash of the hue behind the glyph.">
              <div className="space-y-2">
                {YTY_ROWS.map((family) => (
                  <ZoneTile
                    key={family.id}
                    label={family.name}
                    glyph={ELEMENT_GLYPH[family.id]}
                    edge={EDGE}
                    tile={alpha(family.today, 0.15)}
                    glyphColour={family.today}
                    ground={CARD}
                  />
                ))}
                <ZoneTile
                  label="Clubhouse"
                  glyph="home"
                  edge={INK}
                  tile={alpha(INK, 0.1)}
                  glyphColour={INK}
                  ground={CARD}
                />
              </div>
              <div className="mt-4 space-y-1">
                {YTY_ROWS.map((family) => (
                  <Ratio
                    key={family.id}
                    what={`${family.name} glyph on its 15% tile`}
                    foreground={family.today}
                    background={over(family.today, 0.15, CARD)}
                    use="glyph"
                  />
                ))}
              </div>
            </Panel>

            <Panel
              label="Proposed"
              sub="Neutral tile, strong glyph, strong edge on the active zone."
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
                    ground={CARD}
                  />
                ))}
                <ZoneTile
                  label="Clubhouse"
                  glyph="home"
                  edge={MUTED_INK}
                  tile={GROUND}
                  glyphColour={INK}
                  ground={CARD}
                />
              </div>
              <div className="mt-4 space-y-1">
                {YTY_ROWS.map((family) => (
                  <Ratio
                    key={family.id}
                    what={`${family.name} soft glyph on the neutral tile`}
                    foreground={family.soft}
                    background={GROUND}
                    use="glyph"
                  />
                ))}
              </div>
            </Panel>
          </Compare>
        </div>
      </Case>
    </Question>
  );
}
