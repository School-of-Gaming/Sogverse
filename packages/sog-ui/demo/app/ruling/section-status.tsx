/**
 * Question 2 — the status colours.
 *
 * The heaviest set in the inventory: 335 utility occurrences in 116 files,
 * classified by construct in `STATUS_SITES` in `inventory.ts`, which also
 * carries the regeneration command.
 *
 * **What is settled, and what this section now asks.** Destructive `#FF5C5C`
 * and warning `#DFCB25` are liked: new colours of their own, belonging to no
 * family. Success is Glow and info is Wit — the owner refused two near-
 * duplicate hues in favour of one hue carrying two related meanings, because
 * the glyph and the label already carry the difference. That ruling has a
 * consequence the section is rebuilt around: **half the set is now a brand
 * colour, and a brand colour exists at its authored values or not at all.** A
 * tint of Glow is not Glow. So the two constructs that were built out of tints
 * cannot survive as they are, and this section is the three things left to look
 * at before the set can be ruled:
 *
 * 1. **The tinted ground under its own ink**, 121 sites, reworked with no tint
 *    anywhere. Four candidates, drawn in the three real constructs the count
 *    covers.
 * 2. **The card lit from its leading edge**, the one gradient in the set, the
 *    same tinted effect at card scale and failing for the same reason.
 * 3. **Area and ink** — the role table, drawn once for every hue against every
 *    construct a hue is spent on, and then again in the places a reader really
 *    meets them.
 *
 * **The third thing used to be a question and is now a drawing of an answer.**
 * It was "strong versus soft", six hues × six constructs with the inverted
 * direction beneath each row, and the owner ruled on it by looking: the lighter
 * value carries better on the dark ground for Harmony, Glow and Wit in both
 * area and ink, and Valor reads best as a strong area with a soft ink. What
 * that ruling produced is not a direction at all but a **role table** — a
 * consumer asks for a family's *area* or its *ink*, and the library decides
 * which authored value answers. `YTY_ROLES` in `inventory.ts` holds it with the
 * reasoning; `status-tones.ts` holds the vocabulary both this file and its
 * in-context drawings are built from. The inverted rows are gone, because there
 * is nothing left for them to argue.
 *
 * Everything else the section used to draw has gone. The constructs nobody
 * questioned keep **one compact row of the ruled set each**, because the
 * final ruling waits on seeing the four in context and a set is read in the
 * things it fills. Today's rows survive only where today is the thing being
 * replaced.
 *
 * **Two constructs are folded into the three above rather than drawn again.**
 * The tinted pill (9 sites) is the tinted ground at pill scale — same wash,
 * same ink, smaller box — so it takes whatever the first thing is ruled. The
 * ring (4 sites) is a 40% ring, and a full-value ring is a column of the ruled
 * row, drawn there for all six hues at once and again on a real selected tile
 * in the contexts.
 *
 * **What lands when this is ruled.** A `YTY_ROLES` table in the library beside
 * the tone grammar; a theme that emits `--color-yty-<family>-area` and `-ink`
 * plus the four status pairs, with strong and soft still authored in TypeScript
 * and no longer emitted, so a class can only name a role; Sogverse's `yty.ts`,
 * `voice-zones.ts`, the admin product presentation and every status consumer
 * repointed at the roles; the twelve new pairings in the contrast ledger; the
 * label primitive §11 asks for; Sogverse's four `--color-*` deleted and the
 * email hex mirror reading the library; and the 121 tinted sites and the lit
 * card converted to whatever construct is ruled here. The status token *names*
 * do not move, so no call site changes spelling for that half of it.
 */

import type { CSSProperties, ReactNode } from "react";
import { BRAND, NEUTRALS } from "../../../src/tokens/brand";
import {
  ChevronRight,
  Radio,
  UserRoundSearch,
  type LucideIcon,
} from "lucide-react";

import { tailwindAlpha } from "./colour";
import { STATUS_BY_ID, YTY_ROLES } from "./inventory";
import { InContextCases } from "./section-status-context";
import {
  COPY,
  FILLED,
  NEUTRAL_PANEL,
  RULED,
  RULED_HUES,
  STATUS_GLYPH,
  TODAY,
  labelOn,
  type Hue,
  type Tone,
} from "./status-tones";
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
} from "./parts";

// ------------------------------------------------- painting one construct

/** Which edge a status-coloured rule runs down, if any. */
type Rule = "none" | "leading" | "top";

/**
 * How a candidate paints a construct, which is the whole of what it decides.
 *
 * A construct takes one of these and renders itself; a candidate is a function
 * from a status to one of these. That split is what lets three different
 * constructs be drawn under the same four candidates without any of them
 * restating the candidate's reasoning, and it is what keeps this section
 * smaller than the one it replaces.
 */
interface Paint {
  /** The panel's own ground. Never a tint of the status. */
  readonly fill: string;
  readonly rule: Rule;
  readonly ruleColour: string;
  /** `null` where the construct genuinely has no glyph today. */
  readonly glyph: string | null;
  /** The title, or a one-line construct's only sentence. */
  readonly title: string;
  /** The second line. */
  readonly body: string;
}

/**
 * The rule as a border, because that is how the app would write it:
 * `border-l-4 border-x` on a leading edge, `border-t-2` along the top.
 *
 * A pseudo-element band would draw the same pixels and would have to be
 * positioned; a border is the shape a Tailwind class already reaches for, so
 * what is drawn here is what a converted site would carry.
 */
function ruleStyle(rule: Rule, colour: string): CSSProperties {
  if (rule === "leading") {
    return { borderLeftWidth: 4, borderLeftColor: colour };
  }
  if (rule === "top") return { borderTopWidth: 2, borderTopColor: colour };
  return {};
}

/**
 * `ui/alert.tsx` — the panel, class-for-class: the shell's
 * `relative flex rounded-lg border border-border text-sm` with the `left`
 * alignment's `items-start gap-3 p-3`, a title at `font-medium leading-none`
 * and a description at `text-muted-foreground`.
 *
 * Today its variant class is `bg-x/10 text-x`, so the wash and the title share
 * one hue and only the description is neutral. Every candidate below keeps the
 * description exactly where it is and moves the other two.
 *
 * Drawn on a card and not also on the page ground, which the previous build
 * did. The tint was the only reason to draw both: a 10% wash composites
 * differently over `#1A1A1A` than over `#121212`, so the same class produced
 * two colours. A neutral ground with a full-value edge produces one, on both —
 * which is a property of the candidates rather than an omission, and losing the
 * second row is part of what the ruling buys.
 */
function AlertPanel({ tone, paint }: { tone: Tone; paint: Paint }) {
  const copy = COPY[tone.status];
  return (
    <div
      className="relative flex items-start gap-3 rounded-lg border border-border p-3 text-sm"
      style={{
        backgroundColor: paint.fill,
        ...ruleStyle(paint.rule, paint.ruleColour),
      }}
    >
      {paint.glyph === null ? null : (
        <span className="pt-0.5">
          <Glyph
            icon={STATUS_GLYPH[tone.status]}
            size={18}
            colour={paint.glyph}
          />
        </span>
      )}
      <span className="min-w-0">
        <span
          className="block leading-none font-medium"
          style={{ color: paint.title }}
        >
          {copy.title}
        </span>
        <span className="mt-1 block" style={{ color: paint.body }}>
          {copy.body}
        </span>
      </span>
    </div>
  );
}

/**
 * `admin/products/groups/groups-panel-view.tsx` and `family/EnrollmentCard.tsx`
 * — the no-refund warning a confirm dialog puts under its description, one
 * recipe in two files:
 * `flex items-start gap-2 rounded-md border border-border bg-destructive/10 px-3 py-2.5 text-sm font-semibold text-destructive`
 * with a 16px triangle.
 *
 * The alert's short sibling, and it is drawn because the two behave differently
 * under the same candidate: this one is a single bold clause with nowhere to
 * put a neutral second line, so a candidate that moves the title to `foreground`
 * leaves it with no colour at all except the glyph. Whether that is enough is
 * the thing to look at, and it cannot be seen on the alert.
 */
function FlaggedLine({ tone, paint }: { tone: Tone; paint: Paint }) {
  return (
    <div
      className="flex items-start gap-2 rounded-md border border-border px-3 py-2.5 text-sm font-semibold"
      style={{
        backgroundColor: paint.fill,
        color: paint.title,
        ...ruleStyle(paint.rule, paint.ruleColour),
      }}
    >
      {paint.glyph === null ? null : (
        <span className="mt-0.5">
          <Glyph
            icon={STATUS_GLYPH[tone.status]}
            size={16}
            colour={paint.glyph}
          />
        </span>
      )}
      <span>{COPY[tone.status].line}</span>
    </div>
  );
}

/**
 * `auth/login-form.tsx` — the block above the fields, and the same six lines in
 * every other auth form: `rounded-md bg-destructive/10 p-3 text-sm text-destructive`.
 *
 * **Today it carries no glyph**, which is why it is one of the three: it is the
 * construct where the tint is doing the whole job on its own. Remove the tint
 * and there is nothing left, so every candidate below adds a glyph — the one
 * place in this section where a candidate is not a repaint of what is there.
 * That is a finding rather than a liberty: a neutral panel with neither colour
 * nor glyph is not a quieter error, it is an error that has stopped saying it
 * is one.
 */
function FormError({ tone, paint }: { tone: Tone; paint: Paint }) {
  return (
    <div
      className="flex items-start gap-2 rounded-md p-3 text-sm"
      style={{
        backgroundColor: paint.fill,
        color: paint.title,
        ...ruleStyle(paint.rule, paint.ruleColour),
      }}
    >
      {paint.glyph === null ? null : (
        <span className="mt-0.5">
          <Glyph
            icon={STATUS_GLYPH[tone.status]}
            size={16}
            colour={paint.glyph}
          />
        </span>
      )}
      <span>{COPY[tone.status].field}</span>
    </div>
  );
}

/**
 * One candidate: a name, the tones it is drawn in, and how it paints.
 *
 * `tones` is per candidate rather than per row because the solid fill is the
 * one row that draws info twice.
 */
interface Candidate {
  readonly key: string;
  readonly label: string;
  readonly tones: readonly Tone[];
  readonly paint: (tone: Tone) => Paint;
}

/**
 * Today, then the four candidates, then the top-rule variant of the first.
 *
 * **A — a full-value rule down the leading edge.** The status arrives as a line
 * rather than as a wash, so a brand colour is spent at the value it is
 * authored at, and the panel's ground stays a neutral the palette already
 * ships. The rule takes the hue's area and the glyph takes its ink, which is
 * the role table the third thing in this section draws.
 *
 * **B — glyph and title in status ink, no rule.** The quietest thing that still
 * colour-codes the panel, and the one candidate that spends no area at all.
 *
 * **C — a solid fill under its label.** Drawn so it can be rejected on sight:
 * it is the loudest option in the set, four of these in one column would be a
 * page of traffic lights, and a family used as a ground under a paragraph is
 * the one thing the brand's own rule about families forbids outright. It earns
 * its place because it is the only construct in which a hue is both the area
 * and the ground a label has to read on.
 *
 * **D — nothing.** The plain neutral panel with the status only in the glyph.
 * The floor: if the set reads here, every candidate above it is a choice about
 * emphasis rather than about legibility.
 */

/**
 * The shape all four candidates share: a neutral panel, the glyph in status
 * ink, the body in muted ink. Only the title and the rule move between them,
 * which is the argument in one function signature.
 */
const neutral = (tone: Tone, title: string, rule: Rule = "none"): Paint => ({
  fill: NEUTRAL_PANEL,
  rule,
  ruleColour: tone.area,
  glyph: tone.ink,
  title,
  body: MUTED_INK,
});

const TINT_CANDIDATES: readonly Candidate[] = [
  {
    key: "today",
    label: "Today — bg-x/10 under text-x",
    tones: TODAY,
    paint: (tone) => ({
      fill: tailwindAlpha(tone.area, 10),
      rule: "none",
      ruleColour: tone.area,
      glyph: tone.area,
      title: tone.area,
      body: MUTED_INK,
    }),
  },
  {
    key: "leading",
    label: "A — a rule down the leading edge",
    tones: RULED,
    paint: (tone) => neutral(tone, INK, "leading"),
  },
  {
    key: "ink",
    label: "B — glyph and title in status ink",
    tones: RULED,
    paint: (tone) => neutral(tone, tone.ink),
  },
  {
    key: "solid",
    label: "C — a solid fill under its label",
    tones: FILLED,
    paint: (tone) => ({
      fill: tone.area,
      rule: "none",
      ruleColour: tone.area,
      glyph: tone.onArea,
      title: tone.onArea,
      body: tone.onArea,
    }),
  },
  {
    key: "none",
    label: "D — the status only in the glyph",
    tones: RULED,
    paint: (tone) => neutral(tone, INK),
  },
];

/**
 * The top-rule variant of A, drawn on the alert alone.
 *
 * A 2px band along the top reads as a different thing at different widths: on a
 * panel as wide as a reading column it is a header rule, and on a short one it
 * is a line above a sentence. The alert is the only one of the three that is
 * ever card-wide, so it is the only one where the variant has anything to show.
 */
const TOP_RULE: Candidate = {
  key: "top",
  label: "A — the same rule along the top",
  tones: RULED,
  paint: (tone) => neutral(tone, INK, "top"),
};

/** One construct, drawn once per tone, once per candidate, under one caption. */
function Candidates({
  file,
  page,
  ground,
  candidates,
  render,
}: {
  file: string;
  page: string;
  ground: string;
  candidates: readonly Candidate[];
  render: (tone: Tone, paint: Paint) => ReactNode;
}) {
  return (
    <Exemplar file={file} page={page}>
      <div className="space-y-6">
        {candidates.map((candidate) => (
          <div key={candidate.key}>
            <Caps>{candidate.label}</Caps>
            <div className="mt-3">
              <Compare columns={4}>
                {candidate.tones.map((tone) => (
                  <Panel key={tone.key} label={tone.label}>
                    <div
                      className="rounded-md p-3"
                      style={{ backgroundColor: ground }}
                    >
                      {render(tone, candidate.paint(tone))}
                    </div>
                  </Panel>
                ))}
              </Compare>
            </div>
          </div>
        ))}
      </div>
    </Exemplar>
  );
}

// ---------------------------------- a card lit from its leading edge (1)

/**
 * The two cards, and what each spends.
 *
 * They are drawn together in every candidate because they exist to be told
 * apart at a glance in one list: a parent's My SOG stacks them, and a candidate
 * that reads well on one and vanishes on the other has failed at the only job
 * the treatment has.
 *
 * Act has no soft half and will not get one — that is ruled — so its line and
 * its glyph are both plain act. A 16px glyph is a mark rather than a sentence,
 * which is the whole of why amber may carry it.
 *
 * Both marks are the card's own. `Radio` is the live badge in the header, where
 * it is drawn here. `UserRoundSearch` is the awaiting line's mark, which the
 * card sets in its footer in `text-info` — the candidate that keeps the glyph
 * and drops the gradient is asking whether that mark can move up beside the
 * chevron and carry the state on its own, so it is drawn where it would land.
 */
const LIT_CARDS: readonly {
  key: string;
  kind: string;
  name: string;
  /** The hue today's gradient fades from. */
  today: string;
  /** What the rule takes. */
  area: string;
  /** What the glyph takes. */
  ink: string;
  glyph: LucideIcon;
}[] = [
  {
    key: "live",
    kind: "Club",
    name: "Minecraft Tuesdays",
    today: BRAND.act.hex,
    area: BRAND.act.hex,
    ink: BRAND.act.hex,
    glyph: Radio,
  },
  {
    key: "awaiting",
    kind: "Camp",
    name: "Roblox summer camp",
    today: STATUS_BY_ID.info.today,
    area: YTY_ROLES.wit.area,
    ink: YTY_ROLES.wit.ink,
    glyph: UserRoundSearch,
  },
];

/**
 * `family/EnrollmentCard.tsx` and `gedu/GeduAssignmentCard.tsx` — the card
 * header, class-for-class: the kind at
 * `text-xs font-medium uppercase tracking-wider text-muted-foreground`, the
 * name at `text-lg font-semibold leading-tight`, and the trailing cluster of a
 * liveness mark and a chevron, all inside `flex flex-col gap-4 p-5`.
 *
 * The card's body below the header is left off. Every candidate touches the
 * header and only the header — today's gradient has faded to nothing well
 * before the schedule line — so a second screenful of card per cell would be
 * five identical copies of content nothing is doing to.
 */
function CardHeader({
  kind,
  name,
  image,
  rule,
  ruleColour,
  glyph,
  glyphInk,
}: {
  kind: string;
  name: string;
  image: string | null;
  rule: Rule;
  ruleColour: string;
  glyph: LucideIcon | null;
  glyphInk: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-lg border border-border"
      style={{
        backgroundColor: CARD,
        ...(image === null ? {} : { backgroundImage: image }),
        ...ruleStyle(rule, ruleColour),
      }}
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              {kind}
            </p>
            <p className="text-lg leading-tight font-semibold">{name}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {glyph === null ? null : (
              <Glyph icon={glyph} size={16} colour={glyphInk} />
            )}
            <Glyph icon={ChevronRight} size={20} colour={MUTED_INK} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The five ways the lit card can go.
 *
 * The first is what ships. The next two are the leading-edge and top rules from
 * the tinted-ground candidates, applied to a card instead of a panel, so a
 * ruling on one can be a ruling on both. The fourth drops the treatment to the
 * mark the header already has room for. The fifth drops it entirely, which is a
 * real option here in a way it is not for an alert: the card carries a badge, a
 * schedule and a chevron, and the gradient is the least of what tells a parent
 * which card is which.
 *
 * The act sites in section 7's "callout ground" and "highlighted row" jobs are
 * the same question asked of a panel and of a list row; whichever construct is
 * ruled here should be the one ruled there, and neither is redrawn in the
 * other's section.
 */
interface LitPaint {
  readonly image: string | null;
  readonly rule: Rule;
  readonly ruleColour: string;
  readonly glyph: LucideIcon | null;
}

/** The card with nothing on it, which four of the five candidates start from. */
const PLAIN: LitPaint = {
  image: null,
  rule: "none",
  ruleColour: EDGE,
  glyph: null,
};

const LIT_CANDIDATES: readonly {
  key: string;
  label: string;
  paint: (card: (typeof LIT_CARDS)[number]) => LitPaint;
}[] = [
  {
    key: "today",
    label: "Today — from-x/5 to-transparent",
    paint: (card) => ({
      image: `linear-gradient(to right, ${tailwindAlpha(card.today, 5)}, transparent)`,
      rule: "none",
      ruleColour: card.area,
      glyph: null,
    }),
  },
  {
    key: "leading",
    label: "A rule down the leading edge",
    paint: (card) => ({ ...PLAIN, rule: "leading", ruleColour: card.area }),
  },
  {
    key: "top",
    label: "A rule along the top",
    paint: (card) => ({ ...PLAIN, rule: "top", ruleColour: card.area }),
  },
  {
    key: "glyph",
    label: "The glyph alone",
    paint: (card) => ({ ...PLAIN, glyph: card.glyph }),
  },
  { key: "none", label: "Nothing", paint: () => PLAIN },
];

// ------------------------------------------------- area and ink (§2, §3)

/**
 * The three grounds the ruled row is drawn on, in the order they lighten.
 *
 * **The owner's question: does the call depend on the surface?** The old grid
 * drew every cell on the card and nothing else, so a reader had to trust that a
 * value winning on `#1A1A1A` also wins on the page and in a lifted block. These
 * three are the *complete* set of grounds a family colour can sit on in the dark
 * theme — the library ships no fourth neutral, and there is no light one — so a
 * call that holds across all three holds everywhere, and the surface-dependent
 * exception either shows itself here or does not exist.
 *
 * **A label on an area fill is not part of that question**, because it never
 * sees the ground: the fill covers it, so ink on Glow measures the same 8.83
 * whether the badge sits on the page or in a lifted block. What actually moves
 * between the three stacks is the *ink* column and the shapes — an area's
 * separation from what is behind it — and both move in the same direction and
 * by the same small amount, because the grounds span 1.24:1 end to end.
 *
 * **Ink on each ground**, body floor 4.5: Harmony 7.70 / 7.15 / 6.22, Glow 8.83
 * / 8.21 / 7.14, Valor 8.81 / 8.18 / 7.12, Wit 8.10 / 7.53 / 6.54, destructive
 * 6.19 / 5.75 / 5.00, warning 11.34 / 10.53 / 9.16. The tightest cell in the
 * whole grid is destructive as ink on the lifted grey at 5.00, which still
 * clears the floor by half a point.
 *
 * **Area as a shape against each ground**, non-text floor 3: Harmony 7.70 /
 * 7.15 / 6.22, Glow 8.83 / 8.21 / 7.14, Valor 6.69 / 6.22 / 5.40, Wit 8.10 /
 * 7.53 / 6.54, destructive 6.19 / 5.75 / 5.00, warning 11.34 / 10.53 / 9.16.
 * Nothing comes close to the floor on any ground, so no edge, ring or mark
 * disappears into any surface the app has.
 */
const GROUNDS: readonly { token: string; hex: string }[] = [
  { token: "background", hex: NEUTRALS.background.hex },
  { token: "card", hex: NEUTRALS.card.hex },
  { token: "lifted", hex: NEUTRALS.lifted.hex },
];

/** One hue's two roles, ready to draw, with the label that reads on its area. */
interface Cell {
  readonly name: string;
  readonly area: string;
  readonly ink: string;
  readonly onArea: string;
  readonly glyph: LucideIcon;
}

function cellOf(hue: Hue): Cell {
  return {
    name: hue.name,
    area: hue.area,
    ink: hue.ink,
    onArea: labelOn(hue.area),
    glyph: hue.glyph,
  };
}

/**
 * The six constructs a hue is ever spent on, each drawn from the recipe a real
 * component uses.
 *
 * The set is exhaustive by shape rather than by count: a hue lands as an area
 * with a label on it, as a line, as a ring, as a mark with no words, as a
 * label, or as an icon. Everything in `STATUS_SITES` and everything in the Yty
 * consumers is one of those six.
 *
 * **The fifth column is headed "label" rather than "ink"**, which is §11 in one
 * word: coloured text exists only as the name of a state or a value, beside a
 * glyph in the same hue, and never as a sentence. The sentence form is drawn in
 * the contexts below, in ink, as the rule requires.
 *
 * **Three cells have no site in Sogverse today** and are drawn from the
 * construct's own recipe anyway, because the recipe has to hold for them the
 * moment a component wants one: a Yty family as a ring (nothing rings in a
 * family colour), a Yty family as an edge (the border sweep left the app with
 * no coloured edge anywhere, which is why `STATUS_SITES` has no border row),
 * and a status colour as an unlabelled mark that is not a rail dot. The other
 * thirty-three are copied from something that ships.
 */
const RULED_COLUMNS: readonly {
  key: string;
  name: string;
  render: (cell: Cell, ground: string) => ReactNode;
}[] = [
  {
    key: "fill",
    name: "Fill under a label",
    render: (cell) => (
      <span
        className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold"
        style={{ backgroundColor: cell.area, color: cell.onArea }}
      >
        {cell.name}
      </span>
    ),
  },
  {
    key: "edge",
    name: "Edge",
    render: (cell, ground) => (
      <div
        className="w-full rounded-md border border-border px-2 py-1.5 text-xs"
        style={{
          backgroundColor: ground,
          color: INK,
          borderLeftWidth: 4,
          borderLeftColor: cell.area,
        }}
      >
        {cell.name}
      </div>
    ),
  },
  {
    key: "ring",
    name: "Ring",
    render: (cell, ground) => (
      <div
        className="w-full rounded-md px-2 py-1.5 text-xs"
        style={{
          backgroundColor: ground,
          color: INK,
          boxShadow: `0 0 0 2px ${cell.area}`,
        }}
      >
        {cell.name}
      </div>
    ),
  },
  {
    key: "mark",
    name: "Unlabelled mark",
    render: (cell) => (
      <span className="flex items-center gap-3">
        <span
          aria-hidden
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: cell.area }}
        />
        <span
          aria-hidden
          className="h-4 w-10 rounded"
          style={{ backgroundColor: cell.area }}
        />
      </span>
    ),
  },
  {
    key: "label",
    name: "Label",
    render: (cell) => (
      <span
        className="flex items-center gap-1.5 text-sm font-medium"
        style={{ color: cell.ink }}
      >
        <Glyph icon={cell.glyph} size={14} colour={cell.ink} />
        {cell.name}
      </span>
    ),
  },
  {
    key: "glyph",
    name: "Glyph",
    render: (cell) => <Glyph icon={cell.glyph} size={20} colour={cell.ink} />,
  },
];

/**
 * The ruled row, drawn as a table because the columns have to stay columns.
 *
 * One row per hue, no alternative beneath it: the direction is ruled, and a
 * second row would be arguing a question the owner has answered. What is left
 * to see is whether the answer holds in every construct and on every ground,
 * which is what the four stacks of this table are for.
 *
 * The row's caption carries the recipe in token names — `area soft · ink soft`,
 * or `one value · both roles` for the two colours that have only one — and the
 * variant word is read back off the hex rather than typed, so a caption cannot
 * disagree with the cell beside it.
 */
function RuledRow({ ground }: { ground: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[68rem] border-collapse text-body-s">
        <thead>
          <tr className="border-b border-border text-left align-bottom">
            <th className="w-56 py-2 pr-4 font-semibold tracking-wider uppercase" />
            {RULED_COLUMNS.map((column) => (
              <th
                key={column.key}
                className="px-2 py-2 font-semibold tracking-wider uppercase"
              >
                {column.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {RULED_HUES.map((hue) => {
            const cell = cellOf(hue);
            return (
              <tr
                key={hue.key}
                className="border-b border-border align-middle"
              >
                <th className="py-2 pr-4 text-left font-medium">
                  {hue.name}
                  <span className="block font-brand-mono font-normal text-muted-foreground">
                    {hue.recipe}
                  </span>
                </th>
                {RULED_COLUMNS.map((column) => (
                  <td key={column.key} className="px-2 py-2">
                    <div
                      className="flex min-h-12 items-center justify-center rounded-md p-2"
                      style={{ backgroundColor: ground }}
                    >
                      {column.render(cell, ground)}
                    </div>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The same table on each of the three grounds, labelled with the ground's token. */
function AreaAndInk() {
  return (
    <div className="space-y-10">
      {GROUNDS.map((ground) => (
        <div key={ground.token}>
          <Caps>{ground.token}</Caps>
          <div className="mt-3">
            <RuledRow ground={ground.hex} />
          </div>
        </div>
      ))}
    </div>
  );
}

// --------------------------------- the rest of the set, in one row each

/**
 * `gedu/session-feed/SessionFeedItem.tsx` — the card's trailing status line: a
 * 14px glyph and a word, both in the status colour.
 *
 * The largest construct in the inventory, 166 of the 335 sites, and the one the
 * glyph-and-label rule is written for. It keeps a row because the final ruling
 * waits on seeing the four in context, and this is the context most of them are
 * in.
 */
function MetaLine({ tone }: { tone: Tone }) {
  return (
    <span
      className="flex items-center gap-1.5 text-xs font-medium"
      style={{ color: tone.ink }}
    >
      <Glyph icon={STATUS_GLYPH[tone.status]} size={14} colour={tone.ink} />
      {COPY[tone.status].meta}
    </span>
  );
}

/** `ui/badge.tsx` — the pill `/admin/users/[id]` maps a participation status to. */
function StatusBadge({ tone }: { tone: Tone }) {
  return (
    <span
      className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold shadow"
      style={{ backgroundColor: tone.area, color: tone.onArea }}
    >
      {COPY[tone.status].badge}
    </span>
  );
}

/**
 * `session-feed/SessionFeedShell.tsx` with `gedu/session-feed/SessionFeed.tsx`
 * — the rail dot, 10px across, cut out of the rail by a 4px ring in the page
 * colour.
 *
 * The construct with no words at all, which makes it the hardest case for a
 * shared hue: the glyph-and-label rule that rescues every other one has nothing
 * to work with, and a column of dots is read purely as colour.
 */
function RailDots({ tone }: { tone: Tone }) {
  return (
    <div className="relative space-y-3 border-l border-border pl-6">
      {["Tue 2 Sep", "Tue 9 Sep", "Tue 16 Sep"].map((day, index) => (
        <div key={day} className="relative">
          <span
            aria-hidden
            className="ring-background absolute -left-6 h-2.5 w-2.5 -translate-x-1/2 rounded-full ring-4"
            style={{
              backgroundColor: index === 1 ? tone.area : MUTED_INK,
            }}
          />
          <div
            className="rounded-lg border border-border p-2 text-xs"
            style={{ backgroundColor: CARD, color: INK }}
          >
            {day}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * One compact row: the ruled set in one construct, with no today above it and
 * no candidate beside it.
 *
 * It is a `Candidate` with nothing to decide — the same machinery the reworked
 * constructs use, holding one entry — rather than a second row component. These
 * three constructs are not being ruled on, they are the context the four
 * colours are read in, so the paint they take is simply the recipe.
 */
function ruledOnly(tones: readonly Tone[]): readonly Candidate[] {
  return [
    {
      key: "ruled",
      label: "Area and ink",
      tones,
      paint: (tone) => neutral(tone, tone.ink),
    },
  ];
}

export function StatusSection() {
  return (
    <Question n={2} title="Status colours">
      <Case title="A tinted ground under its own ink">
        <div className="space-y-10">
          <Candidates
            file="ui/alert.tsx"
            page="the seat-purchase flow and the switch-profile dialog"
            ground={CARD}
            candidates={[...TINT_CANDIDATES, TOP_RULE]}
            render={(tone, paint) => <AlertPanel tone={tone} paint={paint} />}
          />
          <Candidates
            file="admin/products/groups/groups-panel-view.tsx with family/EnrollmentCard.tsx"
            page="a confirm dialog, the line under the description"
            ground={CARD}
            candidates={TINT_CANDIDATES}
            render={(tone, paint) => <FlaggedLine tone={tone} paint={paint} />}
          />
          <Candidates
            file="auth/login-form.tsx"
            page="every auth form, the block above the fields"
            ground={CARD}
            candidates={TINT_CANDIDATES}
            render={(tone, paint) => <FormError tone={tone} paint={paint} />}
          />
        </div>
      </Case>

      <Case title="A card lit from its leading edge">
        <Exemplar
          file="family/EnrollmentCard.tsx with gedu/GeduAssignmentCard.tsx"
          page="a parent's My SOG, the live card above the awaiting card"
        >
          <Compare columns={5}>
            {LIT_CANDIDATES.map((candidate) => (
              <Panel key={candidate.key} label={candidate.label}>
                <div className="space-y-3">
                  {LIT_CARDS.map((card) => {
                    const paint = candidate.paint(card);
                    return (
                      <CardHeader
                        key={card.key}
                        kind={card.kind}
                        name={card.name}
                        image={paint.image}
                        rule={paint.rule}
                        ruleColour={paint.ruleColour}
                        glyph={paint.glyph}
                        glyphInk={card.ink}
                      />
                    );
                  })}
                </div>
              </Panel>
            ))}
          </Compare>
        </Exemplar>
      </Case>

      <Case title="Area and ink">
        <AreaAndInk />
      </Case>

      <Case title="The rest of the set">
        <div className="space-y-10">
          <Candidates
            file="gedu/session-feed/SessionFeedItem.tsx"
            page="a gedu's session feed, the card's status line"
            ground={CARD}
            candidates={ruledOnly(RULED)}
            render={(tone) => <MetaLine tone={tone} />}
          />
          <Candidates
            file="ui/badge.tsx"
            page="/admin/users/[id], the participation pill"
            ground={CARD}
            candidates={ruledOnly(FILLED)}
            render={(tone) => <StatusBadge tone={tone} />}
          />
          <Candidates
            file="session-feed/SessionFeedShell.tsx with gedu/session-feed/SessionFeed.tsx"
            page="a session feed, the rail dot"
            ground={GROUND}
            candidates={ruledOnly(RULED)}
            render={(tone) => <RailDots tone={tone} />}
          />
        </div>
      </Case>

      <InContextCases />
    </Question>
  );
}
