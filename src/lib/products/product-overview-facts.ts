import { audienceLabelKey } from "./product-audience";
import { formatClubTermDates } from "./format-product-term-dates";
import {
  formatProductSchedule,
  renderScheduleLinesForDetail,
  type ProductScheduleSubject,
  type ScheduleZoneNaming,
} from "./format-product-schedule";

/**
 * The two "Good to know" facts whose *composition* is a rule rather than a
 * lookup — the schedule's lines and who a product is for.
 *
 * They live here because two surfaces state them and must state them
 * identically: the purchase confirmation page, and the mail that is a second
 * copy of that page. Where a fact is a single formatted value the surfaces can
 * share the formatter directly (`formatProductLocation`,
 * `formatProductSchedule`); these two are compositions *over* those formatters,
 * and a composition duplicated at two call sites is the thing that drifts.
 *
 * **Pure and translator-free.** Neither function chooses a word: the schedule
 * lines are already-formatted clock faces and dates, and the audience answer is
 * a descriptor its caller renders with whichever translator it has. That is
 * what lets a React page and an email builder — which reach different message
 * namespaces — run one rule.
 */

/**
 * A product's schedule as the lines a detail surface prints, with a club's term
 * range folded in as one more line.
 *
 * The fold is why this is a rule and not a call: a club's term ("13 Jan – 30
 * May 2026") is not in its weekly schedule line, camps and events already carry
 * their dates inside theirs, and the helper that knows the difference returns
 * `null` for the types that do. Whoever prints a schedule has to remember all
 * of that, or print a club with no dates on it.
 */
export function productScheduleDisplayLines({
  product,
  locale,
  timeZone,
  now,
  nameZone = "whenAdjusted",
}: {
  product: ProductScheduleSubject;
  locale: string;
  /** The zone the clock faces are rendered in — the viewer's, or the product's own. */
  timeZone: string;
  /** Stable "now", anchoring a recurring schedule's next occurrence. */
  now: Date;
  /**
   * Whether the rendered zone is named beside the times always, or only when
   * they have been moved out of the product's own zone.
   *
   * **`always` is the mail's, and it is one option rather than a second
   * rendering.** A page renders in the viewer's zone and says which zone that
   * is only when it differs from the product's — otherwise the abbrev is noise
   * next to times the reader already reads as local. A mail has no viewer zone
   * to render in, because parents store none, so it renders in the product's
   * own; there the reader cannot tell which zone the times are in and the
   * abbrev is the whole statement. Same formatter, same line, one flag.
   */
  nameZone?: ScheduleZoneNaming;
}): string[] {
  const schedule = formatProductSchedule({ product, locale, timeZone, now });
  const lines = renderScheduleLinesForDetail(schedule, nameZone);
  const termRange = formatClubTermDates(product, locale);
  return termRange ? [...lines, termRange] : lines;
}

/**
 * Who a product is for, in whichever of the three shapes it has — the answer
 * one "Good to know" cell renders, and the reason that grid stays four facts
 * for every audience instead of a family product growing a fifth.
 *
 *   - Gamers-only: the age range alone, unlabelled by audience. That is the
 *     assumed default, so an audience word there would be a row every product
 *     grew for no news.
 *   - Parents-only: the audience word alone. No age range exists to state (an
 *     adult "18+" says something else entirely), so it *replaces* the ages
 *     rather than joining them.
 *   - Family: both, composed by one message ("For families, ages 8–12") rather
 *     than concatenated — a comma is grammar, and grammar is the translator's.
 *
 * `null` only for a row carrying neither an audience label nor an age range,
 * which the schema's CHECKs make unreachable; the caller drops the fact rather
 * than rendering an empty cell.
 */
export type ProductWhoItsFor =
  | { label: "ageRange"; value: { kind: "ages"; min: number; max: number } }
  | { label: "audience"; value: { kind: "parents" } }
  | {
      label: "audience";
      value:
        | { kind: "families" }
        | { kind: "familiesWithAges"; min: number; max: number };
    };

export function productWhoItsFor(product: {
  for_gamers: boolean;
  for_parents: boolean;
  min_age: number | null;
  max_age: number | null;
}): ProductWhoItsFor | null {
  const ages =
    product.min_age !== null && product.max_age !== null
      ? { min: product.min_age, max: product.max_age }
      : null;

  switch (audienceLabelKey(product)) {
    case null:
      return ages === null
        ? null
        : { label: "ageRange", value: { kind: "ages", ...ages } };
    case "parents":
      return { label: "audience", value: { kind: "parents" } };
    case "families":
      return {
        label: "audience",
        // The CHECK ties a range to the gamer audience, so a family product
        // always has one; the ageless branch is the shape of the data, not a
        // case anyone should meet.
        value:
          ages === null
            ? { kind: "families" }
            : { kind: "familiesWithAges", ...ages },
      };
  }
}
