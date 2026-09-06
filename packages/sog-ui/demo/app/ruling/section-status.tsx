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
 * 3. **Strong versus soft**, drawn once for every hue against every construct a
 *    hue is spent on — which is the question the two above run into on their
 *    first line, and the next one to be ruled.
 *
 * Everything else the section used to draw has gone. The constructs nobody
 * questioned keep **one compact row of the proposed set each**, because the
 * final ruling waits on seeing the four in context and a set is read in the
 * things it fills; the collision scenes keep their three exemplars and are
 * drawn once rather than three times. Today's rows survive only where today is
 * the thing being replaced.
 *
 * **Two constructs are folded into the three above rather than drawn again.**
 * The tinted pill (9 sites) is the tinted ground at pill scale — same wash,
 * same ink, smaller box — so it takes whatever the first thing is ruled. The
 * ring (4 sites) is a 40% ring, and a full-value ring is a column of the recipe
 * grid, drawn there for all six hues at once. Redrawing either would be the
 * same picture with a different caption.
 *
 * **What lands when this is ruled.** Four status tokens in the library, each
 * with the ink or white companion that reads on it and its measured pairings in
 * the contrast ledger; success and info as two more rows of the tone grammar
 * rather than two more colours, because a status is a fact and a fact takes a
 * family; the strong/soft recipe as a library rule with the grid below as its
 * proof; Sogverse's four `--color-*` deleted and the email hex mirror reading
 * the library; the 121 tinted sites and the lit card converted to whatever
 * construct is ruled here. The token names do not move, so no call site changes
 * spelling.
 */

import type { CSSProperties, ReactNode } from "react";
import {
  BRAND,
  NEUTRALS,
  YTY_FAMILIES,
  type YtyFamilyId,
} from "../../../src/tokens/brand";
import {
  AlertCircle,
  AlertTriangle,
  Brain,
  CalendarDays,
  Check,
  ChevronRight,
  Coins,
  Heart,
  Info,
  Joystick,
  Mic,
  MicOff,
  Radio,
  School,
  Sun,
  Sword,
  Tent,
  UserRoundSearch,
  UserRoundX,
  UserX,
  Users,
  type LucideIcon,
} from "lucide-react";

import { THRESHOLDS, contrastRatio } from "../../../src/tokens/contrast";
import { tailwindAlpha } from "./colour";
import {
  PROPOSED_STATUSES,
  STATUS_BY_ID,
  STATUS_ROWS,
  type StatusId,
} from "./inventory";
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

/**
 * The two labels a fill can carry, named here so no drawing spells a hex.
 *
 * `LABEL_INK` is the Ground value doing its other job: it is the page's colour
 * *and* the dark label every light fill carries, which is what makes one
 * measurement settle two uses.
 */
const LABEL_INK = NEUTRALS.background.hex;
const WHITE = BRAND.world.foreground;

/**
 * Which of the two a fill carries, measured rather than chosen.
 *
 * Ink wherever ink clears the body floor, white where it does not. Wit strong
 * is the only value in the whole grid that takes the second branch — 4.10 under
 * ink, 4.57 under white — and computing it here rather than typing it means a
 * retune of any family moves its label with it instead of leaving a hardcoded
 * companion that used to be right.
 */
function labelOn(fill: string): string {
  return contrastRatio(fill, LABEL_INK) >= THRESHOLDS.bodyText
    ? LABEL_INK
    : WHITE;
}

/** The neutral panel every no-tint candidate sits on inside a card. */
const NEUTRAL_PANEL = NEUTRALS.muted.hex;

/**
 * One status, as the pair it is spent in: a value for area and line, a value
 * for ink and glyph, and the label that reads on a solid fill of the first.
 *
 * Today's four collapse into the same shape with both halves equal, which is
 * exactly what today's code says — one hex, spent at whatever alpha the site
 * felt like.
 */
interface Tone {
  readonly key: string;
  readonly status: StatusId;
  readonly label: string;
  readonly strong: string;
  readonly soft: string;
  readonly onStrong: string;
}

const TODAY: readonly Tone[] = STATUS_ROWS.map((row) => ({
  key: row.id,
  status: row.id,
  label: `${row.id} ${row.today}`,
  strong: row.today,
  soft: row.today,
  onStrong: row.todayForeground,
}));

const PROPOSED: readonly Tone[] = PROPOSED_STATUSES.map((status) => ({
  key: status.status,
  status: status.status,
  label: status.label,
  strong: status.strong,
  soft: status.soft,
  onStrong: status.onStrong,
}));

/**
 * The proposed set with info drawn twice — the one row where the fork is still
 * live.
 *
 * A solid fill is the only construct where the whole panel is area *and* a
 * label has to read on it, so it is the only one where choosing strong costs
 * something: Wit strong under white clears the body floor by 0.07, and Wit soft
 * under ink clears it by 3.6. Everywhere else the recipe answers it — area
 * takes strong, ink takes soft — and a second info column would be the same
 * picture twice.
 */
const SOLID: readonly Tone[] = PROPOSED.flatMap((tone) =>
  tone.status === "info"
    ? [
        { ...tone, key: "info-strong", label: "info = yty-wit-strong · white" },
        {
          ...tone,
          key: "info-soft",
          label: "info = yty-wit-soft · ink",
          strong: tone.soft,
          onStrong: LABEL_INK,
        },
      ]
    : [{ ...tone, label: `${tone.label} · ink` }],
);

/**
 * The mark each state carries, as `ui/alert.tsx`'s own call sites draw it.
 *
 * The alert is what settles the four for the whole section: it is the one
 * construct in the app that renders all four states from one component, so its
 * marks are the set, and the shorter constructs below borrow them rather than
 * each proposing a mark of its own. Elsewhere a site may reach for a near
 * relative — a session-feed line uses the ringed check where the alert uses the
 * bare one — and that is a difference between sites, not between states.
 */
const STATUS_GLYPH: Record<StatusId, LucideIcon> = {
  destructive: AlertCircle,
  success: Check,
  info: Info,
  warning: AlertTriangle,
};

/**
 * The words each state carries.
 *
 * Real copy of the kind each construct really holds — a field error is a
 * sentence about the field, a flagged line is one bold clause, a badge is one
 * or two words. Lorem would hide the thing this section is for: whether four
 * marks are legible at the size and length the app actually sets them.
 */
const COPY: Record<
  StatusId,
  {
    title: string;
    body: string;
    line: string;
    field: string;
    meta: string;
    badge: string;
  }
> = {
  destructive: {
    title: "Payment failed",
    body: "The card on file was declined, so this month's session is unpaid.",
    line: "Removing a seat mid-term is not refunded.",
    field: "That username is already taken.",
    meta: "Microphone off",
    badge: "Payment failed",
  },
  success: {
    title: "Seat confirmed",
    body: "Aino is on the roster for Tuesday's club.",
    line: "The seat is held until Friday.",
    field: "Aino's Minecraft account is linked.",
    meta: "Report complete",
    badge: "Active",
  },
  info: {
    title: "Times shown in your timezone",
    body: "This club is run in Helsinki time; the clock faces are converted.",
    line: "This club is run in Helsinki time.",
    field: "This club is run in Helsinki time.",
    meta: "Next session",
    badge: "Next session",
  },
  warning: {
    title: "Two seats left",
    body: "This camp closes when the last seat goes, and the waitlist opens after that.",
    line: "Two seats left on this camp.",
    field: "Two seats left on this camp.",
    meta: "Needs attention",
    badge: "Waitlisted",
  },
};

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
 * ships. The rule takes strong and the glyph takes soft, which is the recipe
 * the third thing in this section is drawn to prove.
 *
 * **B — glyph and title in status ink, no rule.** The quietest thing that still
 * colour-codes the panel, and the one candidate that spends no area at all.
 *
 * **C — a solid fill under its label.** Drawn so it can be rejected on sight:
 * it is the loudest option in the set, four of these in one column would be a
 * page of traffic lights, and a family used as a ground under a paragraph is
 * the one thing the brand's own rule about families forbids outright. It earns
 * its place because it is the only candidate where info's fork is still live.
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
  ruleColour: tone.strong,
  glyph: tone.soft,
  title,
  body: MUTED_INK,
});

const TINT_CANDIDATES: readonly Candidate[] = [
  {
    key: "today",
    label: "Today — bg-x/10 under text-x",
    tones: TODAY,
    paint: (tone) => ({
      fill: tailwindAlpha(tone.strong, 10),
      rule: "none",
      ruleColour: tone.strong,
      glyph: tone.strong,
      title: tone.strong,
      body: MUTED_INK,
    }),
  },
  {
    key: "leading",
    label: "A — a rule down the leading edge",
    tones: PROPOSED,
    paint: (tone) => neutral(tone, INK, "leading"),
  },
  {
    key: "ink",
    label: "B — glyph and title in status ink",
    tones: PROPOSED,
    paint: (tone) => neutral(tone, tone.soft),
  },
  {
    key: "solid",
    label: "C — a solid fill under its label",
    tones: SOLID,
    paint: (tone) => ({
      fill: tone.strong,
      rule: "none",
      ruleColour: tone.strong,
      glyph: tone.onStrong,
      title: tone.onStrong,
      body: tone.onStrong,
    }),
  },
  {
    key: "none",
    label: "D — the status only in the glyph",
    tones: PROPOSED,
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
  tones: PROPOSED,
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
              <Compare columns={candidate.tones.length === 5 ? 5 : 4}>
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
    area: YTY_FAMILIES.wit.strong,
    ink: YTY_FAMILIES.wit.soft,
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
 * The act sites in section 8's "callout ground" and "highlighted row" jobs are
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

// ------------------------------------------------ strong versus soft (§2)

/**
 * The six hues the recipe has to cover, in one list.
 *
 * Four are Yty families with two authored values; two are status colours with
 * one, so their strong and soft are the same hex and their two rows in the grid
 * are identical by construction. That identity is worth seeing rather than
 * hiding: it is what says the recipe costs nothing where a colour has only one
 * value, and it puts the four families' difference next to a control.
 */
interface Hue {
  readonly key: string;
  readonly name: string;
  readonly strong: string;
  readonly soft: string;
  readonly glyph: LucideIcon;
}

const FAMILY_GLYPH = {
  harmony: Heart,
  glow: Sun,
  valor: Sword,
  wit: Brain,
} as const satisfies Record<YtyFamilyId, LucideIcon>;

/**
 * The four families in the order the grid draws them, as a list rather than as
 * the record's key order: a record is checked for completeness and a list
 * carries an order, and this needs both.
 */
const FAMILY_ORDER = [
  "harmony",
  "glow",
  "valor",
  "wit",
] as const satisfies readonly YtyFamilyId[];

const RECIPE_HUES: readonly Hue[] = [
  ...FAMILY_ORDER.map((id) => ({
    key: id,
    name: YTY_FAMILIES[id].name,
    strong: YTY_FAMILIES[id].strong,
    soft: YTY_FAMILIES[id].soft,
    glyph: FAMILY_GLYPH[id],
  })),
  ...PROPOSED.filter((tone) => tone.strong === tone.soft).map((tone) => ({
    key: tone.key,
    name: STATUS_BY_ID[tone.status].label,
    strong: tone.strong,
    soft: tone.soft,
    glyph: STATUS_GLYPH[tone.status],
  })),
];

/** One hue, in one direction: what area takes, what ink takes, what reads on the area. */
interface Cell {
  readonly name: string;
  readonly area: string;
  readonly ink: string;
  readonly onArea: string;
  readonly glyph: LucideIcon;
}

/**
 * The six constructs a hue is ever spent on, each drawn from the recipe a real
 * component uses.
 *
 * The set is exhaustive by shape rather than by count: a hue lands as an area
 * with a label on it, as a line, as a ring, as a mark with no words, as a word,
 * or as an icon. Everything in `STATUS_SITES` and everything in the Yty
 * consumers is one of those six.
 *
 * **Three cells have no site in Sogverse today** and are drawn from the
 * construct's own recipe anyway, because the recipe has to hold for them the
 * moment a component wants one: a Yty family as a ring (nothing rings in a
 * family colour), a Yty family as an edge (the border sweep left the app with
 * no coloured edge anywhere, which is why `STATUS_SITES` has no border row),
 * and a status colour as an unlabelled mark in the *soft* direction. The other
 * thirty-three are copied from something that ships.
 */
const RECIPE_COLUMNS: readonly {
  key: string;
  name: string;
  render: (cell: Cell) => ReactNode;
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
    render: (cell) => (
      <div
        className="w-full rounded-md border border-border px-2 py-1.5 text-xs"
        style={{
          backgroundColor: CARD,
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
    render: (cell) => (
      <div
        className="w-full rounded-md px-2 py-1.5 text-xs"
        style={{
          backgroundColor: CARD,
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
    key: "ink",
    name: "Ink",
    render: (cell) => (
      <span className="text-sm font-medium" style={{ color: cell.ink }}>
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
 * The grid, drawn as a table because the columns have to stay columns.
 *
 * Every cell sits on the card ground and no second copy is drawn on the page
 * ground, which the brief allowed for: on `#121212` every value in the set
 * measures *higher* than on `#1A1A1A` (Wit strong 4.10 against 3.81, Wit soft
 * 8.10 against 7.53, and so on down the list), so not one cell changes which
 * side of a floor it is on between the two grounds. Drawing the ink and glyph
 * columns twice would have shown the same pass twice.
 *
 * **What the two rows per hue measure, and where the recipe is forced.** Under
 * the proposed direction — strong for area and line, soft for ink and glyph —
 * every ink cell clears the 4.5 body floor on the card: Harmony 7.15, Glow
 * 8.21, Valor 8.18, Wit 7.53, destructive 5.75, warning 10.53. Every glyph cell
 * clears the 3 glyph floor by the same margins. Every fill's label clears the
 * body floor: 6.11, 6.63, 6.69, 6.19 and 11.34 under ink, and Wit strong at
 * 4.57 under white — the one cell in the grid where the label is not ink, and
 * the reason the `onStrong` field exists.
 *
 * Under the inverted direction the fills all still pass — soft under ink
 * measures 7.70, 8.83, 8.81 and 8.10 — so the inversion cannot be rejected on a
 * fill's arithmetic, and has to be rejected on what a pastel area and a
 * saturated word look like. **One inverted cell fails outright: Wit strong as
 * ink measures 3.81 on the card and 4.10 on the page, under the body floor on
 * both.** It clears the glyph floor, so the inverted glyph cell passes where the
 * inverted ink cell does not — which is the single measured fact that decides
 * the direction for the whole set, and the reason the library's rule is one rule
 * rather than four.
 */
function RecipeGrid() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[68rem] border-collapse text-body-s">
        <thead>
          <tr className="border-b border-border text-left align-bottom">
            <th className="w-56 py-2 pr-4 font-semibold tracking-wider uppercase" />
            {RECIPE_COLUMNS.map((column) => (
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
          {RECIPE_HUES.flatMap((hue) =>
            (
              [
                {
                  key: "recipe",
                  label: `${hue.name} — strong area · soft ink`,
                  cell: {
                    name: hue.name,
                    area: hue.strong,
                    ink: hue.soft,
                    onArea: labelOn(hue.strong),
                    glyph: hue.glyph,
                  },
                },
                {
                  key: "inverted",
                  label: `${hue.name} — soft area · strong ink`,
                  cell: {
                    name: hue.name,
                    area: hue.soft,
                    ink: hue.strong,
                    onArea: labelOn(hue.soft),
                    glyph: hue.glyph,
                  },
                },
              ] as const
            ).map((direction) => (
              <tr
                key={`${hue.key}-${direction.key}`}
                className="border-b border-border align-middle"
              >
                <th className="py-2 pr-4 text-left font-medium">
                  {direction.label}
                </th>
                {RECIPE_COLUMNS.map((column) => (
                  <td key={column.key} className="px-2 py-2">
                    <div
                      className="flex min-h-12 items-center justify-center rounded-md p-2"
                      style={{ backgroundColor: CARD }}
                    >
                      {column.render(direction.cell)}
                    </div>
                  </td>
                ))}
              </tr>
            )),
          )}
        </tbody>
      </table>
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
      style={{ color: tone.soft }}
    >
      <Glyph icon={STATUS_GLYPH[tone.status]} size={14} colour={tone.soft} />
      {COPY[tone.status].meta}
    </span>
  );
}

/** `ui/badge.tsx` — the pill `/admin/users/[id]` maps a participation status to. */
function StatusBadge({ tone }: { tone: Tone }) {
  return (
    <span
      className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold shadow"
      style={{ backgroundColor: tone.strong, color: tone.onStrong }}
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
              backgroundColor: index === 1 ? tone.strong : MUTED_INK,
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
 * One compact row: the proposed set in one construct, with no today above it
 * and no candidate beside it.
 *
 * It is a `Candidate` with nothing to decide — the same machinery the reworked
 * constructs use, holding one entry — rather than a second row component. These
 * three constructs are not being ruled on, they are the context the four
 * colours are read in, so the paint they take is simply the recipe.
 */
function proposedOnly(tones: readonly Tone[]): readonly Candidate[] {
  return [
    {
      key: "proposed",
      label: "Proposed",
      tones,
      paint: (tone) => neutral(tone, tone.soft),
    },
  ];
}

// ------------------------------------------- the collision, in situ

const ZONES: readonly {
  id: "harmony" | "glow" | "valor" | "wit";
  glyph: LucideIcon;
}[] = [
  { id: "harmony", glyph: Heart },
  { id: "glow", glyph: Sun },
  { id: "valor", glyph: Sword },
  { id: "wit", glyph: Brain },
];

/**
 * `voice/ZoneList.tsx` — the zone list, drawn on the no-alpha recipe rather
 * than on the 10% tile it renders today.
 *
 * It used to be drawn as the app renders it, on the ground that a collision is
 * between what is on screen. That reasoning has been overtaken: the tint is the
 * thing this whole section is removing, and putting one back into the frame the
 * status set is judged in would ask the owner to rule on an adjacency that the
 * ruling itself deletes.
 */
function ZoneTiles() {
  return (
    <div className="space-y-2">
      {ZONES.map((zone) => {
        const family = YTY_FAMILIES[zone.id];
        return (
          <div
            key={zone.id}
            className="flex items-center gap-2 rounded-xl border px-3 py-2.5"
            style={{ borderColor: family.strong, backgroundColor: GROUND }}
          >
            <Glyph icon={zone.glyph} size={20} colour={family.soft} />
            <span className="text-body-s" style={{ color: INK }}>
              {family.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * `voice/ParticipantRow.tsx` — the roster's trailing group, whose mic state is a
 * 14px glyph: `text-success` when the mic is open, `text-destructive` when it is
 * muted.
 *
 * The collision verbatim and already on screen: the roster and the zone list are
 * two columns of one page, so under the proposal a Glow mic glyph sits a few
 * centimetres from the Glow zone, meaning "this child can be heard" and "the
 * Glow zone" respectively.
 */
function ParticipantRows({
  success,
  destructive,
}: {
  success: string;
  destructive: string;
}) {
  const people = [
    { name: "Aino", open: true },
    { name: "Mika", open: false },
    { name: "Sanni", open: true },
  ];
  return (
    <div className="space-y-2">
      {people.map((person) => (
        <div
          key={person.name}
          className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border p-2 sm:gap-x-3"
        >
          {/* The real row carries an identicon here. A plain muted square stands
              in for it: the avatar is artwork with its own palette and its own
              question (§7), and drawing one would put a second set of colours
              into the frame the collision is judged in. */}
          <span
            className="h-8 w-8 shrink-0 rounded-md"
            style={{ backgroundColor: NEUTRALS.muted.hex }}
          />
          <span className="min-w-0 max-w-fit flex-1 truncate text-sm font-medium">
            {person.name}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {person.open ? (
              <Glyph icon={Mic} size={14} colour={success} />
            ) : (
              <Glyph icon={MicOff} size={14} colour={destructive} />
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * The product kinds, each with the family and the glyph the tone grammar gives
 * it, and each carrying one real problem with that problem's own mark.
 *
 * The issue marks are not one mark repeated: the grid keys them by issue kind,
 * so an unplaced gamer, a group with no educator, a waitlist against open seats
 * and a missing fee each arrive drawn differently. Four cards holding one glyph
 * would have made the grid look like it says less than it does.
 */
const KINDS: readonly {
  label: string;
  family: "harmony" | "glow" | "valor" | "wit";
  glyph: LucideIcon;
  issue: string;
  issueGlyph: LucideIcon;
}[] = [
  {
    label: "Minecraft Tuesdays",
    family: "harmony",
    glyph: Joystick,
    issue: "4 gamers in no group",
    issueGlyph: UserRoundX,
  },
  {
    label: "Espoo school club",
    family: "wit",
    glyph: School,
    issue: "Group B has no gedu",
    issueGlyph: UserX,
  },
  {
    label: "Autumn build camp",
    family: "valor",
    glyph: Tent,
    issue: "6 waiting, 2 seats open",
    issueGlyph: Users,
  },
  {
    label: "Roblox creator night",
    family: "glow",
    glyph: CalendarDays,
    issue: "No gedu fee set",
    issueGlyph: Coins,
  },
];

/**
 * `admin/dashboard/product-attention-grid.tsx` — the queue's cards, each headed
 * by the product kind's own glyph and carrying its problems as status-toned
 * lines underneath.
 *
 * The second place the collision is already real: the Glow event glyph and the
 * Wit municipality-club glyph sit in the same grid as the warning lines and,
 * four inches up the page, the all-clear's `text-success` check. One card per
 * kind so all four families are present at once, which is how an admin meets
 * them.
 */
function AttentionCards({ warning }: { warning: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {KINDS.map((kind) => {
        const family = YTY_FAMILIES[kind.family];
        return (
          <div
            key={kind.label}
            className="flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-3"
          >
            <span className="flex items-start gap-2">
              <span className="mt-0.5">
                <Glyph icon={kind.glyph} size={16} colour={family.soft} />
              </span>
              <span className="text-sm leading-snug font-medium">
                {kind.label}
              </span>
            </span>
            <span className="flex items-start gap-1.5 text-xs leading-snug">
              <span className="mt-0.5">
                <Glyph icon={kind.issueGlyph} size={14} colour={warning} />
              </span>
              <span>{kind.issue}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The one adjacency this page constructs rather than copies, and why it has to.
 *
 * Wit and info share no surface today: the families are painted on admin
 * product surfaces, on `/about` and in the voice room, and info is painted in
 * feeds, chat and forms — so there is no page to photograph. But the ruling is
 * what removes that guarantee: the moment info *is* Wit, the two meanings are
 * one colour whether or not a page has yet put them side by side, and a
 * decision made on the absence of a screenshot would be a decision made on
 * today's page inventory rather than on the palette.
 */
function WitBesideInfo({ info, onInfo }: { info: string; onInfo: string }) {
  const family = YTY_FAMILIES.wit;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span
        className="inline-flex items-center gap-2 rounded-xl border px-3 py-2.5"
        style={{ borderColor: family.strong, backgroundColor: GROUND }}
      >
        <Glyph icon={Brain} size={20} colour={family.soft} />
        <span className="text-body-s" style={{ color: INK }}>
          {family.name}
        </span>
      </span>
      <span
        className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
        style={{ color: YTY_FAMILIES.wit.soft }}
      >
        Next session
      </span>
      <span
        className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
        style={{ backgroundColor: info, color: onInfo }}
      >
        Live
      </span>
    </div>
  );
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

      <Case title="Strong and soft">
        <RecipeGrid />
      </Case>

      <Case title="The rest of the set">
        <div className="space-y-10">
          <Candidates
            file="gedu/session-feed/SessionFeedItem.tsx"
            page="a gedu's session feed, the card's status line"
            ground={CARD}
            candidates={proposedOnly(PROPOSED)}
            render={(tone) => <MetaLine tone={tone} />}
          />
          <Candidates
            file="ui/badge.tsx"
            page="/admin/users/[id], the participation pill"
            ground={CARD}
            candidates={proposedOnly(SOLID)}
            render={(tone) => <StatusBadge tone={tone} />}
          />
          <Candidates
            file="session-feed/SessionFeedShell.tsx with gedu/session-feed/SessionFeed.tsx"
            page="a session feed, the rail dot"
            ground={GROUND}
            candidates={proposedOnly(PROPOSED)}
            render={(tone) => <RailDots tone={tone} />}
          />
        </div>
      </Case>

      <Case title="Where the hue meets itself">
        <div className="space-y-6">
          <Exemplar
            file="voice/ZoneList.tsx with voice/ParticipantRow.tsx"
            page="a club's voice room — the zones and the roster"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <ZoneTiles />
              <ParticipantRows
                success={YTY_FAMILIES.glow.soft}
                destructive="#FF5C5C"
              />
            </div>
          </Exemplar>
          <Exemplar
            file="admin/dashboard/product-attention-grid.tsx"
            page="/admin — the attention queue, one card per kind"
          >
            <AttentionCards warning="#DFCB25" />
          </Exemplar>
          <Exemplar
            file="voice/ZoneList.tsx with gedu/session-feed/SessionFeedItem.tsx"
            page="the Wit zone tile and the feed's session tag"
          >
            <WitBesideInfo info={YTY_FAMILIES.wit.strong} onInfo={WHITE} />
          </Exemplar>
        </div>
      </Case>
    </Question>
  );
}
