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
  Check,
  Info,
  type LucideIcon,
} from "lucide-react";

import {
  BRAND,
  NEUTRALS,
  YTY_FAMILIES,
  type YtyFamilyId,
} from "../../../src/tokens/brand";
import { THRESHOLDS, contrastRatio, hexToRgb } from "../../../src/tokens/contrast";
import { YTY_ELEMENT_GRAMMAR } from "../../../src/tokens/grammar";
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
export const NEUTRAL_PANEL = NEUTRALS.lifted.hex;

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
 * The four family marks, read off the library's own element grammar.
 *
 * They used to be listed here, because the marks were themselves a question and
 * a colour ruled against a candidate mark would have been two questions in one
 * drawing. That question is ruled and landed, so the list is gone: the page
 * draws whatever the library says an element's mark is, and a later retune of a
 * glyph moves every Valor in this section with it rather than leaving a sword
 * behind in one file.
 */
export const FAMILY_GLYPH = {
  harmony: YTY_ELEMENT_GRAMMAR.harmony.glyph,
  glow: YTY_ELEMENT_GRAMMAR.glow.glyph,
  valor: YTY_ELEMENT_GRAMMAR.valor.glyph,
  wit: YTY_ELEMENT_GRAMMAR.wit.glyph,
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

// ------------------------------------------- Valor on the dark ground

/**
 * The five Valor oranges the owner picks from, and the arithmetic that makes
 * the middle three.
 *
 * # Why there is a third option at all
 *
 * Valor is the one family whose colour is still open, and it is open because
 * **both authored values were rejected on sight**. Seen at strong in both
 * roles, the owner found it "quite dark" as text and as a glyph; seen at soft,
 * "a peach". Neither reading is a mistake in the drawing: `#FD700D` and
 * `#FF993D` are the brand's own pair, and **the brand authored them against a
 * white page**, where strong is the value that separates from the ground and
 * soft is the decorative one. Our single theme is dark, and on `#121212` the
 * pair lands between two failures rather than either side of one success.
 *
 * The other three families had no such problem, and the reason is the hue.
 * **Orange loses its chroma when it is lightened, where pink, green and blue do
 * not.** The sRGB gamut is at its widest for orange right about where the
 * strong value already sits, so every step toward soft's lightness is a step
 * the colour cannot take without giving up saturation — which is exactly what
 * "a peach" describes. Harmony, Glow and Wit lighten with their chroma intact,
 * which is why soft answered both roles for all three at once.
 *
 * # What the middle three are
 *
 * Three colours between the pair, derived in **OKLCH**, which is the space that
 * separates the three things the eye is judging here: lightness, chroma and
 * hue. Each candidate steps the lightness a quarter, a half and three quarters
 * of the way from strong's `L 0.7062` to soft's `L 0.7744`, carries the hue the
 * same fraction of the way from `h 46.46` to `h 58.48`, and asks for **strong's
 * chroma, `C 0.1938`** — strong's saturation at soft's brightness, which is the
 * colour neither authored value is.
 *
 * **All three clamp, and the clamping is the finding rather than a caveat.**
 * `C 0.1938` is out of the sRGB gamut at every one of the three lightnesses, so
 * each candidate takes the most chroma its lightness and hue can hold:
 *
 * | step | L | h | chroma asked | chroma held | hex |
 * |---|---|---|---|---|---|
 * | 25% | 0.7233 | 49.47 | 0.1938 | 0.1879 | `#FF7A13` |
 * | 50% | 0.7403 | 52.47 | 0.1938 | 0.1777 | `#FF8524` |
 * | 75% | 0.7574 | 55.48 | 0.1938 | 0.1681 | `#FF8F31` |
 *
 * That the ceiling falls as the lightness rises **is** the claim about orange,
 * measured rather than asserted: the three candidates are the brightest,
 * most saturated oranges that exist at those lightnesses, and if the fade from
 * strong to soft still reads as a fade, no colour in sRGB can stop it.
 *
 * # Measured
 *
 * All five against the three grounds as **ink**, body floor 4.5 —
 * `#FD700D` 6.69 / 6.22 / 5.40, `#FF7A13` 7.18 / 6.67 / 5.80, `#FF8524` 7.70 /
 * 7.15 / 6.22, `#FF8F31` 8.23 / 7.65 / 6.65, `#FF993D` 8.81 / 8.18 / 7.12.
 * **Nothing fails**: the tightest cell in the set is strong as ink on the
 * lifted grey at 5.40, half a point clear of the floor, and every step toward
 * soft only widens it. So contrast decides nothing here and the eye decides
 * everything, which is the honest position to put the drawing in.
 *
 * As a **fill under a label** the five measure 6.69, 7.18, 7.70, 8.23 and 8.81
 * under ink `#121212` and 2.80, 2.61, 2.43, 2.28 and 2.13 under white. The
 * first column is the same arithmetic as ink-on-background — the page colour
 * and the label ink are one value — and the second says what it says about
 * every member of this set: **no Valor fill takes a white label**, at any point
 * between the authored pair.
 *
 * # What lands, either way
 *
 * **If a derived value wins**, it is the first declared departure on a hue. A
 * `valor` entry in `brand.ts` whose one colour is the derived hex, declared as
 * "Valor's orange on the dark ground, derived from the brand's pair", with the
 * reason beside it — orange loses its chroma when lightened where pink, green
 * and blue do not, so the brand's white-ground pair has no member that both
 * carries and reads on `#121212` — and **both authored values recorded beside
 * it** as the brand's white-ground pair, so nothing is lost by not being
 * emitted. Valor stays one colour used twice, exactly like the other three: the
 * departure is on the value, never on the shape of the table.
 *
 * **If strong or soft wins**, there is no departure. The winner becomes
 * `valor`'s single colour the way Harmony, Glow and Wit take soft, the other
 * authored value is recorded in the doc comment as its white-ground twin, and
 * the library goes on holding that a brand colour exists only at its authored
 * values with no exception on any hue.
 */
export interface ValorCandidate {
  readonly key: string;
  /** The candidate's name on the page, which is its hex and nothing else. */
  readonly hex: string;
}

/** OKLCH as the three numbers the derivation steps: lightness, chroma, hue in degrees. */
type Oklch = readonly [l: number, c: number, h: number];

/** sRGB 0–255 → linear-light 0–1. */
function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Linear-light 0–1 → sRGB 0–1. */
function toSrgb(value: number): number {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}

/** A hex, as the OKLCH the steps are taken in. */
function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  const long = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const medium = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const short = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const l = 0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short;
  const a = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short;
  const bb = 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short;
  const hue = (Math.atan2(bb, a) * 180) / Math.PI;
  return [l, Math.hypot(a, bb), hue < 0 ? hue + 360 : hue];
}

/** An OKLCH back to linear-light sRGB, which may fall outside 0–1. */
function oklchToLinearRgb([l, c, h]: Oklch): readonly [number, number, number] {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);
  const long = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ];
}

/** Whether an OKLCH names a colour sRGB can actually show. */
function inGamut(lch: Oklch): boolean {
  return oklchToLinearRgb(lch).every(
    (channel) => channel >= -1e-6 && channel <= 1 + 1e-6,
  );
}

/**
 * The most chroma a lightness and a hue can hold in sRGB, bisected.
 *
 * This is the function that makes the claim about orange checkable rather than
 * rhetorical: run it up Valor's hue and the ceiling falls as the lightness
 * rises, which is what a peach is.
 */
function maxChroma(l: number, h: number): number {
  let low = 0;
  let high = 0.4;
  for (let step = 0; step < 60; step += 1) {
    const middle = (low + high) / 2;
    if (inGamut([l, middle, h])) low = middle;
    else high = middle;
  }
  return low;
}

/** An OKLCH as `#RRGGBB`, clipped to the gamut it was already clamped into. */
function oklchToHex(lch: Oklch): string {
  const channels = oklchToLinearRgb(lch).map((channel) =>
    Math.round(Math.min(1, Math.max(0, toSrgb(channel))) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase(),
  );
  return `#${channels.join("")}`;
}

/**
 * A colour `fraction` of the way from `from` to `to` in lightness and hue,
 * holding `from`'s chroma for as long as the gamut allows it.
 *
 * Pure, and the only arithmetic behind the three middle candidates: nothing on
 * the page spells a derived hex, so a retuned authored pair moves its
 * candidates with it rather than leaving three stale literals behind.
 */
export function towards(from: string, to: string, fraction: number): string {
  const [fromL, fromC, fromH] = hexToOklch(from);
  const [toL, , toH] = hexToOklch(to);
  const l = fromL + fraction * (toL - fromL);
  const h = fromH + fraction * (toH - fromH);
  return oklchToHex([l, Math.min(fromC, maxChroma(l, h)), h]);
}

/**
 * The five, in the order they lighten: the brand's strong, three derived, the
 * brand's soft.
 *
 * The authored pair sits at the ends rather than in a column of its own so the
 * set reads as one gradient and the eye can find the place it stops being dark
 * and has not yet become a peach.
 */
export const VALOR_CANDIDATES: readonly ValorCandidate[] = [
  { key: "strong", hex: YTY_FAMILIES.valor.strong },
  ...[
    { key: "quarter", fraction: 0.25 },
    { key: "half", fraction: 0.5 },
    { key: "three-quarters", fraction: 0.75 },
  ].map(({ key, fraction }) => ({
    key,
    hex: towards(YTY_FAMILIES.valor.strong, YTY_FAMILIES.valor.soft, fraction),
  })),
  { key: "soft", hex: YTY_FAMILIES.valor.soft },
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
