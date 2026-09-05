/**
 * Question 2 — the status colours.
 *
 * The heaviest set in the inventory, roughly 390 call sites, and three
 * independent problems that can be ruled on separately. All three are drawn
 * rather than described; the reasoning and the measurements behind them are in
 * the doc comment on `STATUS_ROWS` in `inventory.ts`.
 *
 * **The label.** Three of the four foregrounds are white on a light fill and
 * miss the body floor. That is not something to assert with a number: the badge
 * and the button are drawn at their real size with the real label, today beside
 * the candidate, and whether the word is readable is the ruling.
 *
 * **The hue.** Each status swatch is drawn beside the library colour it sits
 * nearest, at the same size, with no distance quoted — two squares side by
 * side is the argument.
 *
 * **The alert.** `border-x/50 bg-x/10` is the alpha step the library bans, and
 * the tint is drawn as a real alpha over the card, so the flattening is visible.
 * The proposed alert is a neutral ground with a full-value edge.
 *
 * Two alternatives close the section: info drawn with no hue at all, and
 * warning drawn as the brand amber beside a real call to action, which is what
 * makes that collision a picture rather than a claim.
 */

import { BRAND, YTY_FAMILIES } from "../../../src/tokens/brand";
import { alpha } from "./colour";
import { STATUS_ROWS } from "./inventory";
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
  Swatch,
  type GlyphName,
} from "./parts";

const STATUS_GLYPH: Record<string, GlyphName> = {
  destructive: "cross",
  success: "check",
  info: "info",
  warning: "alert",
};

/** The words each state carries, taken from the shapes these tokens really fill. */
const STATUS_COPY: Record<
  string,
  { title: string; body: string; action: string; badge: string }
> = {
  destructive: {
    title: "Payment failed",
    body: "The card on file was declined, so this month's session is unpaid.",
    action: "Remove seat",
    badge: "Payment failed",
  },
  success: {
    title: "Seat confirmed",
    body: "Aino is on the roster for Tuesday's club.",
    action: "Mark complete",
    badge: "Active",
  },
  info: {
    title: "Times shown in your timezone",
    body: "This club is run in Helsinki time; the clock faces are converted.",
    action: "Show details",
    badge: "All",
  },
  warning: {
    title: "Two seats left",
    body: "This camp closes when the last seat goes, and the waitlist opens after that.",
    action: "Join waitlist",
    badge: "Waitlisted",
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

/** `ui/button.tsx` in a status fill, at the size a real action is drawn. */
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
      className="inline-flex h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-medium shadow-sm"
      style={{ backgroundColor: fill, color: ink }}
    >
      {label}
    </span>
  );
}

/**
 * `ui/badge.tsx` filled with a status token — how `admin/users/[id]/page.tsx`
 * maps a participation status to a pill. This is the construct the failing
 * label measurement lands on, at the size it lands at.
 */
function StatusBadge({
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
      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold shadow"
      style={{ backgroundColor: fill, color: ink, borderColor: fill }}
    >
      {label}
    </span>
  );
}

/**
 * The colour as text, on both grounds a page is built from.
 *
 * The words are the state's own name rather than a sentence about it: `Alert`
 * sets its variant's text in the status colour, so this is what that variant
 * looks like at body size on each ground.
 */
function TextOnGrounds({ label, colour }: { label: string; colour: string }) {
  return (
    <div className="space-y-2">
      <p
        className="rounded p-2 text-body-s"
        style={{ backgroundColor: CARD, color: colour }}
      >
        {label} — on a card
      </p>
      <p
        className="rounded p-2 text-body-s"
        style={{ backgroundColor: GROUND, color: colour }}
      >
        {label} — on the page
      </p>
    </div>
  );
}

export function StatusSection() {
  return (
    <Question n={2} title="Status colours">
      {STATUS_ROWS.map((status) => {
        const glyph = STATUS_GLYPH[status.id];
        const copy = STATUS_COPY[status.id];
        return (
          <Case key={status.id} title={status.label}>
            <div className="space-y-6">
              <div className="rounded-lg border border-border p-4">
                <Caps>Nearest in hue</Caps>
                <div className="mt-3 grid max-w-md gap-4 sm:grid-cols-2">
                  <Swatch hex={status.today} name={status.label} />
                  <Swatch
                    hex={status.collidesWith.hex}
                    name={status.collidesWith.name}
                  />
                </div>
              </div>

              <Compare columns={3}>
                <Panel label="Today, as rendered">
                  <div className="space-y-4">
                    <TextOnGrounds label={status.label} colour={status.today} />
                    <Exemplar
                      file="ui/alert.tsx"
                      page="the seat-purchase flow and the switch-profile dialog"
                    >
                      <AlertBox
                        glyph={glyph}
                        title={copy.title}
                        body={copy.body}
                        edge={EDGE}
                        ground={alpha(status.today, 0.1)}
                        ink={status.today}
                        bodyInk={MUTED_INK}
                      />
                    </Exemplar>
                    <Exemplar
                      file="ui/badge.tsx"
                      page="/admin/users/[id], the status pill"
                    >
                      <StatusBadge
                        label={copy.badge}
                        fill={status.today}
                        ink={status.todayForeground}
                      />
                    </Exemplar>
                    <Exemplar
                      file="ui/button.tsx"
                      page="the confirm dialog's affirmative action"
                    >
                      <FilledButton
                        label={copy.action}
                        fill={status.today}
                        ink={status.todayForeground}
                      />
                    </Exemplar>
                  </div>
                </Panel>

                <Panel label="Today, as authored">
                  <Exemplar
                    file="ui/alert.tsx"
                    page="the same alert, with its authored edge"
                  >
                    <AlertBox
                      glyph={glyph}
                      title={copy.title}
                      body={copy.body}
                      edge={alpha(status.today, 0.5)}
                      ground={alpha(status.today, 0.1)}
                      ink={status.today}
                      bodyInk={MUTED_INK}
                    />
                  </Exemplar>
                </Panel>

                <Panel label="Proposed">
                  <div className="space-y-4">
                    <TextOnGrounds
                      label={status.label}
                      colour={status.candidate}
                    />
                    <Exemplar
                      file="ui/alert.tsx"
                      page="the same alert, on a neutral ground"
                    >
                      <AlertBox
                        glyph={glyph}
                        title={copy.title}
                        body={copy.body}
                        edge={status.candidate}
                        ground={CARD}
                        ink={status.candidate}
                        bodyInk={MUTED_INK}
                      />
                    </Exemplar>
                    <Exemplar
                      file="ui/badge.tsx"
                      page="the same status pill, under an ink label"
                    >
                      <StatusBadge
                        label={copy.badge}
                        fill={status.candidate}
                        ink={GROUND}
                      />
                    </Exemplar>
                    <Exemplar
                      file="ui/button.tsx"
                      page="the same action, under an ink label"
                    >
                      <FilledButton
                        label={copy.action}
                        fill={status.candidate}
                        ink={GROUND}
                      />
                    </Exemplar>
                  </div>
                </Panel>
              </Compare>
            </div>
          </Case>
        );
      })}

      <Case title="Alternatives">
        <Compare columns={2}>
          <Panel label="Info with no hue">
            <div className="space-y-4">
              <Exemplar
                file="ui/alert.tsx"
                page="the informational note as a neutral panel"
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
              </Exemplar>
              <div className="grid gap-4 sm:grid-cols-2">
                <Swatch hex={YTY_FAMILIES.wit.strong} name="Wit strong" />
                <Swatch hex={YTY_FAMILIES.wit.soft} name="Wit soft" />
              </div>
            </div>
          </Panel>

          <Panel label="Warning as the brand amber">
            <div className="space-y-4">
              <Exemplar
                file="ui/alert.tsx"
                page="the caution, drawn in the act colour"
              >
                <AlertBox
                  glyph="alert"
                  title={STATUS_COPY.warning.title}
                  body={STATUS_COPY.warning.body}
                  edge={BRAND.primary.hex}
                  ground={CARD}
                  ink={BRAND.primary.hex}
                  bodyInk={MUTED_INK}
                />
              </Exemplar>
              <Exemplar
                file="ui/button.tsx"
                page="a call to action beside the caution it would share a colour with"
              >
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
              </Exemplar>
            </div>
          </Panel>
        </Compare>
      </Case>
    </Question>
  );
}
