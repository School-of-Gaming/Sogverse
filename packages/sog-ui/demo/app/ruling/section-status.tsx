/**
 * Question 2 — the status colours.
 *
 * The heaviest section of the inventory: roughly 390 call sites across the four
 * hues and their foregrounds. Three separate problems are drawn here, and they
 * are independent of each other, so they can be ruled on separately.
 *
 * **The labels are illegible.** Three of the four foregrounds are white on a
 * light fill and miss the body floor: destructive 3.78:1, info 3.48:1, success
 * 2.52:1. Only warning's dark label passes. The library's brand pair already
 * states the rule these break — a light fill takes a dark label — so the
 * proposal is that every status fill takes ink, and the white foregrounds go
 * whatever else is decided.
 *
 * **The hues collide.** The tone grammar is one meaning per hue, and warning
 * sits five degrees from the brand amber, success twelve from Glow's green, and
 * info six from Wit's soft blue. The collision strip at the top of each case is
 * the whole argument: two swatches side by side, and the question of whether a
 * reader could tell what a mark meant from its colour.
 *
 * **The alert composites.** `border-x/50 bg-x/10` is the alpha step the library
 * bans, and on this ground the 10% wash lands within a couple of steps of the
 * card it sits on — which is why the alert reads as a tinted rectangle rather
 * than as a state.
 *
 * The retuned candidates are tuned against the card, the lighter of the two
 * grounds. That single measurement settles two uses at once: ink is the same
 * hex as the page ground, so a colour clearing 4.5:1 against the card is safe
 * both as text on the card and as a fill under an ink label.
 */

import { BRAND, YTY_FAMILIES } from "../../../src/tokens/brand";
import { alpha, hueOf, over } from "./colour";
import { STATUS_ROWS } from "./inventory";
import {
  CARD,
  Case,
  Caps,
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
  type GlyphName,
} from "./parts";

const STATUS_GLYPH: Record<string, GlyphName> = {
  destructive: "cross",
  success: "check",
  info: "info",
  warning: "alert",
};

/** The sentence each state would carry in a real alert. */
const STATUS_COPY: Record<string, { title: string; body: string; action: string }> = {
  destructive: {
    title: "Payment failed",
    body: "The card on file was declined, so this month's session is unpaid.",
    action: "Remove seat",
  },
  success: {
    title: "Seat confirmed",
    body: "Aino is on the roster for Tuesday's club.",
    action: "Mark complete",
  },
  info: {
    title: "Times shown in your timezone",
    body: "This club is run in Helsinki time; the clock faces below are converted.",
    action: "Show details",
  },
  warning: {
    title: "Two seats left",
    body: "This camp closes when the last seat goes, and the waitlist opens after that.",
    action: "Join waitlist",
  },
};

/** The alert as `ui/alert.tsx` composes it, with whatever edge, ground and ink it is given. */
function AlertBox({
  glyph,
  title,
  body,
  edge,
  ground,
  ink,
  bodyInk,
}: {
  glyph: GlyphName;
  title: string;
  body: string;
  edge: string;
  ground: string;
  ink: string;
  bodyInk: string;
}) {
  return (
    <div
      className="flex items-start gap-3 rounded-lg border p-3 text-body-s"
      style={{ borderColor: edge, backgroundColor: ground }}
    >
      <span className="pt-0.5">
        <Glyph name={glyph} size={18} colour={ink} />
      </span>
      <span className="min-w-0">
        <span className="block font-medium" style={{ color: ink }}>
          {title}
        </span>
        <span className="block" style={{ color: bodyInk }}>
          {body}
        </span>
      </span>
    </div>
  );
}

function FilledButton({
  label,
  fill,
  ink,
}: {
  label: string;
  fill: string;
  ink: string;
}) {
  return (
    <span
      className="inline-flex items-center rounded-md px-4 py-2 text-cta"
      style={{ backgroundColor: fill, color: ink }}
    >
      {label}
    </span>
  );
}

function TextSamples({ colour }: { colour: string }) {
  return (
    <div className="space-y-2">
      <p
        className="rounded p-2 text-body-s"
        style={{ backgroundColor: CARD, color: colour }}
      >
        This sentence is set in the status colour, on a card.
      </p>
      <p
        className="rounded p-2 text-body-s"
        style={{ backgroundColor: GROUND, color: colour }}
      >
        And this one on the page ground behind it.
      </p>
    </div>
  );
}

/** Two swatches and the hue distance between them, which is the collision argument. */
function CollisionStrip({
  status,
  statusHex,
  otherName,
  otherHex,
}: {
  status: string;
  statusHex: string;
  otherName: string;
  otherHex: string;
}) {
  const gapRaw = Math.abs(hueOf(statusHex) - hueOf(otherHex));
  const gap = gapRaw > 180 ? 360 - gapRaw : gapRaw;
  return (
    <div className="rounded-lg border border-border p-4">
      <Caps>Hue collision</Caps>
      <div className="mt-3 grid max-w-md gap-4 sm:grid-cols-2">
        <Swatch hex={statusHex} name={status} sub="a state" />
        <Swatch hex={otherHex} name={otherName} sub="a meaning" />
      </div>
      <p className="mt-3 font-brand-mono text-body-s text-muted-foreground">
        {`${gap.toFixed(0)}° apart`}
      </p>
    </div>
  );
}

export function StatusSection() {
  return (
    <Question
      n={2}
      title="Status colours"
      asks="Do destructive, success, info and warning enter the library as they are, or retuned? Three of their four labels are below the body floor today, and each of the four sits within a few degrees of a colour that already means something else."
    >
      {STATUS_ROWS.map((status) => {
        const glyph = STATUS_GLYPH[status.id];
        const copy = STATUS_COPY[status.id];
        const todayGround = over(status.today, 0.1, CARD);
        const todayEdge = over(status.today, 0.5, CARD);
        return (
          <Case key={status.id} title={`${status.label} — ${status.uses} uses`}>
            <div className="space-y-6">
              <CollisionStrip
                status={status.label}
                statusHex={status.today}
                otherName={status.collidesWith.name}
                otherHex={status.collidesWith.hex}
              />

              <Compare columns={3}>
                <Panel
                  label="(a) Today, as the app renders it"
                  sub="Admitted as-is. The alert's authored edge never wins, so the grey one is drawn."
                >
                  <div className="space-y-4">
                    <TextSamples colour={status.today} />
                    <AlertBox
                      glyph={glyph}
                      title={copy.title}
                      body={copy.body}
                      edge={EDGE}
                      ground={alpha(status.today, 0.1)}
                      ink={status.today}
                      bodyInk={MUTED_INK}
                    />
                    <div>
                      <FilledButton
                        label={copy.action}
                        fill={status.today}
                        ink={status.todayForeground}
                      />
                    </div>
                    <div className="space-y-1">
                      <Ratio
                        what="text on card"
                        foreground={status.today}
                        background={CARD}
                        use="body"
                      />
                      <Ratio
                        what="text on ground"
                        foreground={status.today}
                        background={GROUND}
                        use="body"
                      />
                      <Ratio
                        what="glyph on the 10% wash"
                        foreground={status.today}
                        background={todayGround}
                        use="glyph"
                      />
                      <Ratio
                        what="button label on the fill"
                        foreground={status.todayForeground}
                        background={status.today}
                        use="body"
                      />
                      <p className="font-brand-mono text-body-s text-muted-foreground">
                        {`wash composites to ${todayGround}`}
                      </p>
                    </div>
                  </div>
                </Panel>

                <Panel
                  label="Today, as authored"
                  sub="Never rendered in the app until now — the border bug is fixed on this branch. Only the alert differs from the column beside it."
                >
                  <div className="space-y-4">
                    <AlertBox
                      glyph={glyph}
                      title={copy.title}
                      body={copy.body}
                      edge={alpha(status.today, 0.5)}
                      ground={alpha(status.today, 0.1)}
                      ink={status.today}
                      bodyInk={MUTED_INK}
                    />
                    <div className="space-y-1">
                      <Ratio
                        what="edge on card"
                        foreground={todayEdge}
                        background={CARD}
                        use="glyph"
                      />
                      <p className="font-brand-mono text-body-s text-muted-foreground">
                        {`edge composites to ${todayEdge}`}
                      </p>
                      <p className="font-brand-mono text-body-s text-muted-foreground">
                        {`wash composites to ${todayGround}`}
                      </p>
                    </div>
                  </div>
                </Panel>

                <Panel
                  label="(b) Proposed, retuned"
                  sub={status.why}
                >
                  <div className="space-y-4">
                    <TextSamples colour={status.candidate} />
                    <AlertBox
                      glyph={glyph}
                      title={copy.title}
                      body={copy.body}
                      edge={status.candidate}
                      ground={CARD}
                      ink={status.candidate}
                      bodyInk={MUTED_INK}
                    />
                    <div>
                      <FilledButton
                        label={copy.action}
                        fill={status.candidate}
                        ink={GROUND}
                      />
                    </div>
                    <div className="space-y-1">
                      <Ratio
                        what="text on card"
                        foreground={status.candidate}
                        background={CARD}
                        use="body"
                      />
                      <Ratio
                        what="text on ground"
                        foreground={status.candidate}
                        background={GROUND}
                        use="body"
                      />
                      <Ratio
                        what="edge on card"
                        foreground={status.candidate}
                        background={CARD}
                        use="glyph"
                      />
                      <Ratio
                        what="ink label on the fill"
                        foreground={GROUND}
                        background={status.candidate}
                        use="body"
                      />
                      <p className="font-brand-mono text-body-s text-muted-foreground">
                        {`${status.today} → ${status.candidate}`}
                      </p>
                    </div>
                  </div>
                </Panel>
              </Compare>
            </div>
          </Case>
        );
      })}

      <Case title="Two alternatives, if the collisions are the thing that matters">
        <Note>
          Neither of these is the proposal above. They are the two moves that
          remove a collision instead of narrowing it, drawn small so they can be
          ruled out by looking rather than argued about.
        </Note>
        <div className="mt-5">
          <Compare columns={2}>
            <Panel
              label="Info with no hue at all"
              sub="An informational note is a neutral panel with a glyph. Blue goes back to Wit, and the info token retires."
            >
              <AlertBox
                glyph="info"
                title={STATUS_COPY.info.title}
                body={STATUS_COPY.info.body}
                edge={EDGE}
                ground={CARD}
                ink={INK}
                bodyInk={MUTED_INK}
              />
              <div className="mt-4 space-y-1">
                <Ratio
                  what="title on card"
                  foreground={INK}
                  background={CARD}
                  use="body"
                />
                <Ratio
                  what="body on card"
                  foreground={MUTED_INK}
                  background={CARD}
                  use="body"
                />
                <Ratio
                  what="neutral edge on card"
                  foreground={EDGE}
                  background={CARD}
                  use="glyph"
                />
              </div>
              <div className="mt-4">
                <Caps>What blue then means, unambiguously</Caps>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Swatch
                    hex={YTY_FAMILIES.wit.strong}
                    name="Wit strong"
                    sub="knowledge"
                  />
                  <Swatch
                    hex={YTY_FAMILIES.wit.soft}
                    name="Wit soft"
                    sub="knowledge, as ink"
                  />
                </div>
              </div>
            </Panel>

            <Panel
              label="Warning as the brand amber"
              sub="If warning cannot escape amber's neighbourhood, the other answer is to stop trying: one yellow, and the glyph carries the difference."
            >
              <div className="space-y-4">
                <AlertBox
                  glyph="alert"
                  title={STATUS_COPY.warning.title}
                  body={STATUS_COPY.warning.body}
                  edge={BRAND.primary.hex}
                  ground={CARD}
                  ink={BRAND.primary.hex}
                  bodyInk={MUTED_INK}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <FilledButton
                    label="Buy a seat"
                    fill={BRAND.primary.hex}
                    ink={BRAND.primary.foreground}
                  />
                  <FilledButton
                    label={STATUS_COPY.warning.action}
                    fill={BRAND.primary.hex}
                    ink={BRAND.primary.foreground}
                  />
                </div>
                <Note>
                  The cost is drawn rather than described: a call to action and a
                  caution, in the same colour, side by side.
                </Note>
                <div className="space-y-1">
                  <Ratio
                    what="amber on card"
                    foreground={BRAND.primary.hex}
                    background={CARD}
                    use="body"
                  />
                  <Ratio
                    what="ink label on amber"
                    foreground={BRAND.primary.foreground}
                    background={BRAND.primary.hex}
                    use="body"
                  />
                </div>
              </div>
            </Panel>
          </Compare>
        </div>
      </Case>
    </Question>
  );
}
