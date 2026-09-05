/**
 * Question 3 — the greys.
 *
 * Two of Sogverse's greys are real: `muted` (#262626) and `accent` (#212121)
 * are lifts the library has no value for, and they carry 241 uses between them.
 * Everything else in this section is a second name for a colour the library
 * already ships — `popover` is byte-identical to `card`, `input` to `border`,
 * `ring` to `primary`, and five of the seven sidebar tokens to a neutral or to
 * the brand. Those are not decisions to make, they are call sites to move.
 *
 * The one grey that is genuinely its own is `sidebar-background` at #171717,
 * sitting between the page ground and the card. It is drawn three ways below —
 * as it is, as the ground, and as a card — because a five-step difference in a
 * near-black is exactly the kind of value that cannot be judged from a number.
 */

import { BRAND } from "../../../src/tokens/brand";
import {
  CARD,
  Caps,
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

const MUTED = "#262626";
const ACCENT = "#212121";
const SIDEBAR_TODAY = "#171717";

const NAV = ["Dashboard", "Products", "Groups", "Users", "Settings"];

/** The dashboard sidebar as `layout/sidebar.tsx` composes it, on whatever ground it is given. */
function SidebarStrip({ ground }: { ground: string }) {
  return (
    <div
      className="flex h-64 overflow-hidden rounded-lg border"
      style={{ borderColor: EDGE, backgroundColor: GROUND }}
    >
      <div
        className="flex w-40 shrink-0 flex-col border-r"
        style={{ borderColor: EDGE, backgroundColor: ground }}
      >
        <nav className="flex-1 space-y-1 p-2">
          {NAV.map((item, index) => (
            <span
              key={item}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-body-s"
              style={
                index === 0
                  ? {
                      backgroundColor: BRAND.primary.hex,
                      color: BRAND.primary.foreground,
                    }
                  : index === 2
                    ? { backgroundColor: MUTED, color: INK }
                    : { color: INK }
              }
            >
              <Glyph
                name="gamepad"
                size={14}
                colour={index === 0 ? BRAND.primary.foreground : MUTED_INK}
              />
              {item}
            </span>
          ))}
        </nav>
        <div className="border-t p-3" style={{ borderColor: EDGE }}>
          <p className="text-body-s font-medium" style={{ color: INK }}>
            Aino Virtanen
          </p>
          <p className="text-body-s" style={{ color: MUTED_INK }}>
            Admin
          </p>
        </div>
      </div>
      <div className="flex-1 p-4">
        <p className="text-h4" style={{ color: INK }}>
          Products
        </p>
        <div
          className="mt-3 rounded-lg border p-3"
          style={{ borderColor: EDGE, backgroundColor: CARD }}
        >
          <p className="text-body-s" style={{ color: INK }}>
            A card on the page, for the sidebar to be judged against.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Two swatches asserting one value under two names. */
function AliasPair({
  from,
  to,
  hex,
}: {
  from: string;
  to: string;
  hex: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Swatch hex={hex} name={from} sub="Sogverse" />
      <Swatch hex={hex} name={to} sub="the library" />
    </div>
  );
}

export function GreysSection() {
  return (
    <Question
      n={3}
      title="The greys"
      asks="Do muted and accent enter the library as neutrals, and does the sidebar keep a ground of its own — or take the page's, or the card's?"
    >
      <Case title="The sidebar's ground">
        <Compare columns={3}>
          <Panel label="Today — #171717" sub="Its own value, between the ground and the card.">
            <SidebarStrip ground={SIDEBAR_TODAY} />
            <div className="mt-4 space-y-1">
              <Ratio
                what="ink on the sidebar"
                foreground={INK}
                background={SIDEBAR_TODAY}
                use="body"
              />
              <Ratio
                what="muted ink on the sidebar"
                foreground={MUTED_INK}
                background={SIDEBAR_TODAY}
                use="body"
              />
            </div>
          </Panel>
          <Panel label="As the ground — #121212" sub="The sidebar stops being a surface and becomes part of the page.">
            <SidebarStrip ground={GROUND} />
            <div className="mt-4 space-y-1">
              <Ratio
                what="ink on the sidebar"
                foreground={INK}
                background={GROUND}
                use="body"
              />
              <Ratio
                what="muted ink on the sidebar"
                foreground={MUTED_INK}
                background={GROUND}
                use="body"
              />
            </div>
          </Panel>
          <Panel label="As a card — #1A1A1A" sub="The sidebar reads as the same lift a card takes.">
            <SidebarStrip ground={CARD} />
            <div className="mt-4 space-y-1">
              <Ratio
                what="ink on the sidebar"
                foreground={INK}
                background={CARD}
                use="body"
              />
              <Ratio
                what="muted ink on the sidebar"
                foreground={MUTED_INK}
                background={CARD}
                use="body"
              />
            </div>
          </Panel>
        </Compare>
      </Case>

      <Case title="Muted, on a card">
        <Compare columns={2}>
          <Panel label="Today" sub="171 uses. A panel inside a card, and the scrollbar track.">
            <div
              className="rounded-lg border p-4"
              style={{ borderColor: EDGE, backgroundColor: CARD }}
            >
              <p className="text-h4" style={{ color: INK }}>
                Session report
              </p>
              <div
                className="mt-3 rounded-md p-3"
                style={{ backgroundColor: MUTED }}
              >
                <p className="text-body-s" style={{ color: INK }}>
                  Aino built a redstone door and explained it to the group.
                </p>
                <p className="mt-1 text-body-s" style={{ color: MUTED_INK }}>
                  Written by Mikko, Tuesday
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-1">
              <Ratio
                what="ink on muted"
                foreground={INK}
                background={MUTED}
                use="body"
              />
              <Ratio
                what="muted ink on muted"
                foreground={MUTED_INK}
                background={MUTED}
                use="body"
              />
            </div>
          </Panel>
          <Panel label="Proposed" sub="Unchanged — it enters the library as a neutral at this value.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Swatch hex={MUTED} name="Muted" sub="a lift above the card" />
              <Swatch hex={ACCENT} name="Accent" sub="the hover ground" />
            </div>
            <Note>
              Both sit above the card and below the border, which is the gap the
              library&rsquo;s five neutrals leave open. Nothing about either
              value is proposed to change; what is proposed is that the library
              own them, so a page cannot invent a sixth.
            </Note>
          </Panel>
        </Compare>
      </Case>

      <Case title="Accent, as a hover">
        <Compare columns={2}>
          <Panel label="Today" sub="70 uses. The row under the pointer, on a card.">
            <div
              className="overflow-hidden rounded-lg border"
              style={{ borderColor: EDGE, backgroundColor: CARD }}
            >
              {["Aino Virtanen", "Mikko Laine", "Elsa Berg"].map(
                (name, index) => (
                  <div
                    key={name}
                    className="flex items-center justify-between px-4 py-3 text-body-s"
                    style={{
                      backgroundColor: index === 1 ? ACCENT : CARD,
                      color: INK,
                    }}
                  >
                    <span>{name}</span>
                    <span style={{ color: MUTED_INK }}>
                      {index === 1 ? "hovered" : "at rest"}
                    </span>
                  </div>
                ),
              )}
            </div>
            <div className="mt-4 space-y-1">
              <Ratio
                what="ink on accent"
                foreground={INK}
                background={ACCENT}
                use="body"
              />
              <Ratio
                what="accent against the card it lifts from"
                foreground={ACCENT}
                background={CARD}
                use="glyph"
              />
            </div>
            <Note>
              A hover is not text on a ground, so the second measurement is not a
              floor it has to clear — it is the number that says how visible the
              lift is, and the mark beside it is measuring the wrong thing on
              purpose. Read the ratio, not the verdict: it is barely above 1,
              which is the question this panel is really asking.
            </Note>
          </Panel>
          <Panel label="Proposed" sub="Unchanged, entering the library as the hover neutral.">
            <div
              className="overflow-hidden rounded-lg border"
              style={{ borderColor: EDGE, backgroundColor: CARD }}
            >
              {["Aino Virtanen", "Mikko Laine", "Elsa Berg"].map(
                (name, index) => (
                  <div
                    key={name}
                    className="flex items-center justify-between px-4 py-3 text-body-s"
                    style={{
                      backgroundColor: index === 1 ? MUTED : CARD,
                      color: INK,
                    }}
                  >
                    <span>{name}</span>
                    <span style={{ color: MUTED_INK }}>
                      {index === 1 ? "hovered, at muted instead" : "at rest"}
                    </span>
                  </div>
                ),
              )}
            </div>
            <div className="mt-4 space-y-1">
              <Ratio
                what="muted against the card it lifts from"
                foreground={MUTED}
                background={CARD}
                use="glyph"
              />
            </div>
            <Note>
              The alternative worth seeing beside it: if the library takes only
              one grey above the card rather than two, muted is the one that can
              be seen, and accent is the one that cannot.
            </Note>
          </Panel>
        </Compare>
      </Case>

      <Case title="The tokens that are only second names">
        <Note>
          Each pair below is one value under two names. Nothing renders
          differently after the rename; what changes is that there is one fewer
          place for the two to drift apart.
        </Note>
        <div className="mt-5 grid gap-8 lg:grid-cols-2">
          <div>
            <Caps>popover → card</Caps>
            <div className="mt-3">
              <AliasPair from="popover" to="card" hex={CARD} />
            </div>
          </div>
          <div>
            <Caps>input → border</Caps>
            <div className="mt-3">
              <AliasPair from="input" to="border" hex={EDGE} />
            </div>
          </div>
          <div>
            <Caps>ring → primary</Caps>
            <div className="mt-3">
              <AliasPair from="ring" to="primary" hex={BRAND.primary.hex} />
            </div>
          </div>
          <div>
            <Caps>
              card-foreground, popover-foreground, accent-foreground,
              sidebar-foreground → foreground
            </Caps>
            <div className="mt-3">
              <AliasPair from="four names" to="foreground" hex={INK} />
            </div>
          </div>
        </div>
      </Case>
    </Question>
  );
}
