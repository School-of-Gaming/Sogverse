/**
 * The vocabulary the status question is drawn in — the roles, the hues, the
 * marks and the words — shared by the section and by its in-context drawings.
 *
 * It exists because one question outgrew one file, the way the greys did: the
 * ruled row and the contexts have to be drawn from **one** table, or the page
 * would be showing two rulings that agree today. So the table lives here and
 * both files read it.
 *
 * # The role table
 *
 * **A consumer never names strong or soft.** A family has two roles and they
 * are the only two things a surface asks for:
 *
 * - **area** — a fill, an edge, a ring, an unlabelled mark. Everything that is
 *   a shape rather than a word.
 * - **ink** — a label or a glyph on a neutral ground. Everything that is read
 *   or recognised rather than filled.
 *
 * Which authored value each role takes is a per-family decision, made by the
 * owner on the drawing and recorded here:
 *
 * | family | area | ink |
 * |---|---|---|
 * | Harmony | soft | soft |
 * | Glow | soft | soft |
 * | Valor | **strong** | soft |
 * | Wit | soft | soft |
 *
 * **Why soft carries area for three of the four, which is the inversion of the
 * habit the library shipped with.** The brand's pairs were tuned against a
 * white page, where the strong half is the one that separates from the ground
 * and the soft half is the decorative one. Our single theme is dark, and on
 * `#121212` that reading turns over: the lighter value is the one that lifts
 * off the ground, and the strong value — a saturated mid-tone chosen to hold
 * its own against white — sinks into a near-black card and reads as a duller,
 * muddier version of the hue it is meant to be. The owner saw the two drawn
 * side by side in every construct and picked the lighter one for Harmony, Glow
 * and Wit in **both** roles.
 *
 * **Valor is the exception and it is a property of the hue.** Valor's strong is
 * `#FD700D`, a bright orange that is already light enough to carry an area on
 * the dark ground, and its soft is a pale peach that reads as a wash rather
 * than a shape. So Valor fills strong and inks soft — the one family where the
 * two roles take different values, and the reason the table is per family
 * rather than one rule for all four.
 *
 * **A label on an area fill is ink `#121212`, never white.** Measured, not
 * assumed: every area value in the table clears the 4.5 body floor against ink
 * (Harmony 7.70, Glow 8.83, Valor 6.69, Wit 8.10, destructive 6.19, warning
 * 11.34) and none of them clears it against white (2.43, 2.12, 2.80, 2.31,
 * 3.03, 1.65). `labelOn` computes it anyway rather than hardcoding ink, so a
 * retuned family moves its label with it.
 *
 * **What this settles that was open.** Info's fork is gone: info is Wit, Wit's
 * area is soft, and a Wit fill therefore takes an ink label like every other —
 * there is no white anywhere in the set. Wit strong, the one value that failed
 * the body floor as ink (3.81 on the card), is not spent in either role.
 *
 * # What lands if this is confirmed
 *
 * A `YTY_ROLES` table in the library beside the tone grammar, keyed by family,
 * holding the two roles. The generated theme emits `--color-yty-<family>-area`
 * and `--color-yty-<family>-ink`, plus the status pairs (`--color-success-*`,
 * `--color-info-*`, `--color-destructive-*`, `--color-warning-*`) as aliases of
 * the same values. **Strong and soft stay authored in TypeScript and are no
 * longer emitted**, so a Sogverse class can only name a role: `bg-yty-glow-area`
 * exists and `bg-yty-glow-strong` stops existing, which is the mechanism rather
 * than the habit. Sogverse's `lib/constants/yty.ts`, `lib/constants/voice-zones.ts`,
 * `admin/dashboard/product-type-presentation.ts` and every status consumer
 * repoint to the roles; the contrast ledger gains the twelve pairings above; and
 * the label primitive §11 asks for takes a family or a status and picks its own
 * colour, so no call site writes a coloured text utility.
 */

import {
  AlertCircle,
  AlertTriangle,
  Brain,
  Check,
  Heart,
  Info,
  Sun,
  Sword,
  type LucideIcon,
} from "lucide-react";

import {
  BRAND,
  NEUTRALS,
  YTY_FAMILIES,
  type YtyFamilyId,
} from "../../../src/tokens/brand";
import { THRESHOLDS, contrastRatio } from "../../../src/tokens/contrast";
import { PROPOSED_STATUSES, STATUS_BY_ID, STATUS_ROWS, YTY_ROLES, type StatusId } from "./inventory";

/**
 * The two labels a fill can carry, named here so no drawing spells a hex.
 *
 * `LABEL_INK` is the Ground value doing its other job: it is the page's colour
 * *and* the dark label every area fill carries, which is what makes one
 * measurement settle two uses.
 */
export const LABEL_INK = NEUTRALS.background.hex;
export const WHITE = BRAND.world.foreground;

/**
 * Which of the two a fill carries, measured rather than chosen.
 *
 * Under the role table nothing takes the second branch — every area value
 * clears the body floor against ink — but the branch stays, because the
 * function is the mechanism that keeps the claim true after a retune rather
 * than a comment asserting it was true once.
 */
export function labelOn(fill: string): string {
  return contrastRatio(fill, LABEL_INK) >= THRESHOLDS.bodyText
    ? LABEL_INK
    : WHITE;
}

/** The neutral panel every no-tint candidate sits on inside a card. */
export const NEUTRAL_PANEL = NEUTRALS.muted.hex;

/**
 * One status, as the two roles it is spent in.
 *
 * Today's four collapse into the same shape with both roles equal, which is
 * exactly what today's code says — one hex, spent at whatever alpha the site
 * felt like.
 */
export interface Tone {
  readonly key: string;
  readonly status: StatusId;
  readonly label: string;
  /** Fills, edges, rings, unlabelled marks. */
  readonly area: string;
  /** Labels and glyphs on a neutral ground. */
  readonly ink: string;
  /** The label that reads on a solid fill of `area`. */
  readonly onArea: string;
}

export const TODAY: readonly Tone[] = STATUS_ROWS.map((row) => ({
  key: row.id,
  status: row.id,
  label: `${row.id} ${row.today}`,
  area: row.today,
  ink: row.today,
  onArea: row.todayForeground,
}));

export const RULED: readonly Tone[] = PROPOSED_STATUSES.map((status) => ({
  key: status.status,
  status: status.status,
  label: status.label,
  area: status.area,
  ink: status.ink,
  onArea: status.onArea,
}));

/**
 * The same four where a label has to read on the fill.
 *
 * It used to hold five, because info was drawn as strong-under-white and
 * soft-under-ink and the choice was live. The role table closes it: info's area
 * is Wit soft and its label is ink, like every other member of the set.
 */
export const FILLED: readonly Tone[] = RULED.map((tone) => ({
  ...tone,
  label: `${tone.label} · ink`,
}));

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
export const STATUS_GLYPH: Record<StatusId, LucideIcon> = {
  destructive: AlertCircle,
  success: Check,
  info: Info,
  warning: AlertTriangle,
};

/**
 * The four family marks Sogverse draws today (`lib/constants/yty.ts`).
 *
 * Two of them are themselves open — section 10 is ruling on Glow's sun and
 * Valor's sword — so what is drawn here is what ships, not what is proposed
 * there. A colour ruled against a mark the app does not carry would be a colour
 * ruled on the wrong picture, and a colour ruled against a mark that is itself
 * a candidate would be two questions in one drawing.
 */
export const FAMILY_GLYPH = {
  harmony: Heart,
  glow: Sun,
  valor: Sword,
  wit: Brain,
} as const satisfies Record<YtyFamilyId, LucideIcon>;

/**
 * The four families in the order every drawing takes them, as a list rather
 * than the record's key order: a record is checked for completeness and a list
 * carries an order, and this needs both.
 */
export const FAMILY_ORDER = [
  "harmony",
  "glow",
  "valor",
  "wit",
] as const satisfies readonly YtyFamilyId[];

/** One hue under the role table: what area takes, what ink takes, and its mark. */
export interface Hue {
  readonly key: string;
  readonly name: string;
  readonly area: string;
  readonly ink: string;
  /** The recipe in token names — the row's own caption. */
  readonly recipe: string;
  readonly glyph: LucideIcon;
}

/**
 * Which authored variant a value is, derived rather than typed.
 *
 * The recipe caption has to say `soft` or `strong`, and typing that beside the
 * table would be a second copy of the table in prose — free to go on saying
 * `strong` after the value moved. Reading it back off the hex means the caption
 * cannot disagree with what is drawn in the cell next to it.
 */
function variantName(family: YtyFamilyId, hex: string): string {
  return hex === YTY_FAMILIES[family].strong ? "strong" : "soft";
}

/**
 * The six hues the roles have to cover.
 *
 * Four are families with two authored values and a role table deciding which
 * goes where; two are status colours with one value, which serves both roles.
 * That single-value pair is worth drawing beside the families rather than
 * hiding: it is the control that says the role table costs nothing where a
 * colour has only one value.
 */
export const RULED_HUES: readonly Hue[] = [
  ...FAMILY_ORDER.map((id) => ({
    key: id,
    name: YTY_FAMILIES[id].name,
    area: YTY_ROLES[id].area,
    ink: YTY_ROLES[id].ink,
    recipe: `area ${variantName(id, YTY_ROLES[id].area)} · ink ${variantName(id, YTY_ROLES[id].ink)}`,
    glyph: FAMILY_GLYPH[id],
  })),
  ...RULED.filter(
    (tone) => tone.status === "destructive" || tone.status === "warning",
  ).map((tone) => ({
    key: tone.key,
    name: STATUS_BY_ID[tone.status].label,
    area: tone.area,
    ink: tone.ink,
    recipe: "one value · both roles",
    glyph: STATUS_GLYPH[tone.status],
  })),
];

/**
 * The words each state carries.
 *
 * Real copy of the kind each construct really holds — a field error is a
 * sentence about the field, a flagged line is one bold clause, a badge is one
 * or two words. Lorem would hide the thing this section is for: whether four
 * marks are legible at the size and length the app actually sets them.
 *
 * `label` and `sentence` are the two halves §11 divides: a label is the name of
 * a state and may be coloured, a sentence is something a parent reads through
 * and may not be. Both are held per status so the two forms can be drawn from
 * one place and cannot drift into being about different things.
 */
export const COPY: Record<
  StatusId,
  {
    title: string;
    body: string;
    line: string;
    field: string;
    meta: string;
    badge: string;
    sentence: string;
  }
> = {
  destructive: {
    title: "Payment failed",
    body: "The card on file was declined, so this month's session is unpaid.",
    line: "Removing a seat mid-term is not refunded.",
    field: "That username is already taken.",
    meta: "Microphone off",
    badge: "Payment failed",
    sentence:
      "The card on file was declined. Update it to keep Aino's seat in Tuesday's club.",
  },
  success: {
    title: "Seat confirmed",
    body: "Aino is on the roster for Tuesday's club.",
    line: "The seat is held until Friday.",
    field: "Aino's Minecraft account is linked.",
    meta: "Report complete",
    badge: "Active",
    sentence: "Aino's Minecraft account is linked and ready for Tuesday.",
  },
  info: {
    title: "Times shown in your timezone",
    body: "This club is run in Helsinki time; the clock faces are converted.",
    line: "This club is run in Helsinki time.",
    field: "This club is run in Helsinki time.",
    meta: "Next session",
    badge: "Next session",
    sentence:
      "This club is run in Helsinki time; the times below are shown in yours.",
  },
  warning: {
    title: "Two seats left",
    body: "This camp closes when the last seat goes, and the waitlist opens after that.",
    line: "Two seats left on this camp.",
    field: "Two seats left on this camp.",
    meta: "Needs attention",
    badge: "Waitlisted",
    sentence:
      "Two seats are left on this camp, and the waitlist opens when the last one goes.",
  },
};
