"use client";

import { useId, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, TriangleAlert } from "lucide-react";
import { CollapsibleRegion } from "@/components/gedu/session-feed/CollapsibleRegion";
import { SCHEDULE_PART_SEPARATOR } from "@/lib/products/format-product-schedule";
import { cn, formatDateOnly } from "@/lib/utils";

/**
 * The pieces every invoicing ledger is drawn from — the municipality invoice
 * and the gedu invoice are both one month read down a money axis, one line per
 * thing, opened for the working, and these are the parts of that reading that
 * are the same thing on both pages rather than merely alike.
 *
 * Every word is a prop: which namespace a label comes from is the page's
 * business, and the only strings read here are the platform's shared week label
 * and nothing else.
 */

/**
 * The one horizontal inset every row on a ledger shares — which is what puts
 * every total on the page on one right edge.
 */
export const LEDGER_ROW_INSET = "px-3";

/**
 * Facts about a total, strung along one line.
 *
 * The separator is punctuation rather than copy — it is the same middle dot the
 * schedule formatter already joins a line's parts with — so it is written here
 * and not in five message files, where it would be five chances to type a
 * hyphen instead.
 */
export function CountLine({ parts }: { parts: readonly string[] }) {
  return <>{parts.join(SCHEDULE_PART_SEPARATOR)}</>;
}

/**
 * A phrase on a muted count line that says something is short or wrong.
 *
 * An inline span rather than a line of its own: it travels along the count line
 * the reader is already scanning, which is what keeps a line with a warning
 * exactly as tall as one without. It brings its own leading separator, because
 * it only exists when there is something before it to separate from.
 */
export function CountLineWarning({ children }: { children: ReactNode }) {
  return (
    <>
      {SCHEDULE_PART_SEPARATOR}
      <span className="font-medium text-warning">{children}</span>
    </>
  );
}

/**
 * A figure that cannot be stated, in its place: a triangle and one phrase in
 * warning tone. It stands where the fee or the total would have been, and it is
 * what an unset fee looks like everywhere on a ledger — never a zero.
 */
export function LedgerFlag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-warning">
      <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden />
      {label}
    </span>
  );
}

/**
 * The ledger's first line: what the month is made of on the left, what it
 * comes to on the right.
 *
 * It is the ledger's own first row rather than a card above it because the
 * total has to end on the same right padding as every total underneath it, and
 * a separate card's padding is a different padding. The warnings travel with
 * the counts on the left rather than under the figure, so the figure keeps the
 * line to itself and the row stays one line high.
 */
export function LedgerSummaryLine({
  facts,
  caption,
  figure,
}: {
  /** The muted count line, warnings included. */
  facts: ReactNode;
  /** The noun the figure is — the one caption on the ledger. */
  caption: string;
  /** The formatted total. */
  figure: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5",
        LEDGER_ROW_INSET,
      )}
    >
      <p className="text-xs text-muted-foreground">{facts}</p>
      <p className="ml-auto flex items-baseline gap-2">
        {/* Furniture: the one caption on the ledger, because a figure at the end
            of a line of counts would otherwise be a number with no noun. */}
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {caption}
        </span>
        <span className="text-base font-semibold tabular-nums">{figure}</span>
      </p>
    </div>
  );
}

/**
 * The chevron that opens a line — the keyboard target of every disclosure on a
 * ledger.
 *
 * A ledger's lines take the click across their whole width as a pointer
 * convenience, and carry links; a row-level control would have those links
 * nested inside it, which is the one arrangement with no correct answer for a
 * keyboard or a screen reader. So the real disclosure is always this button,
 * carrying its own name, `aria-expanded` and focus ring, and it stops its own
 * click: the row is listening too, and left to bubble the toggle would run
 * twice and land back where it started.
 */
export function DisclosureButton({
  isOpen,
  onToggle,
  label,
  controls,
  size,
}: {
  isOpen: boolean;
  onToggle: () => void;
  /** What it opens, by name. */
  label: string;
  /**
   * The region it opens — passed only while that region exists, so nothing
   * ever points at an element that is not there.
   */
  controls: string | undefined;
  /** `section` on a ledger's top-level lines, `row` inside a table. */
  size: "section" | "row";
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      aria-expanded={isOpen}
      aria-controls={controls}
      aria-label={label}
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act",
        size === "section" && "shrink-0 self-center",
      )}
    >
      <ChevronDown
        aria-hidden
        className={cn(
          "transition-transform duration-200",
          size === "section" ? "h-4 w-4" : "h-3.5 w-3.5",
          isOpen && "rotate-180",
        )}
      />
    </button>
  );
}

/**
 * One top-level line of a ledger — a municipality, a gedu — and what it opens
 * onto.
 *
 * **The line is identical open and closed**, which is what keeps the layout
 * rule satisfied: opening adds the working underneath and moves nothing the
 * reader was already looking at, and it is their own click that did it.
 *
 * The region stays mounted while it is shut — inert, clipped to nothing — which
 * is what lets the line name the region it controls at all times. Below the
 * width its table needs, the region scrolls sideways rather than stacking: a
 * ledger is read at a desk, and the scroll is the region's own, so the page
 * body's width is untouched.
 */
export function LedgerSection({
  isOpen,
  onToggle,
  toggleLabel,
  line,
  children,
}: {
  isOpen: boolean;
  onToggle: () => void;
  /** The chevron's accessible name — what opening this line shows. */
  toggleLabel: string;
  /** Everything on the line after the chevron. */
  line: ReactNode;
  /** The working, shown when open. */
  children: ReactNode;
}) {
  const regionId = useId();

  return (
    <section>
      {/* The whole line takes the click as a pointer convenience, and the
          chevron is the keyboard target; links on the line stop their own
          clicks from travelling. The inset stays on the row, so the hit area
          reaches the row's own edges. */}
      <div
        onClick={onToggle}
        className={cn(
          "flex cursor-pointer items-baseline gap-2 py-2.5 text-left transition-colors hover:bg-hover",
          LEDGER_ROW_INSET,
        )}
      >
        <DisclosureButton
          isOpen={isOpen}
          onToggle={onToggle}
          label={toggleLabel}
          controls={regionId}
          size="section"
        />
        {line}
      </div>
      <CollapsibleRegion open={isOpen} id={regionId}>
        <div className={cn("overflow-x-auto pb-1", LEDGER_ROW_INSET)}>
          {children}
        </div>
      </CollapsibleRegion>
    </section>
  );
}

/**
 * A ledger table's column header row.
 *
 * Furniture, not voice: a column header is a marker a reader scans for
 * structure, which is the one place the house style keeps its caps.
 */
export function LedgerHeaderRow({ children }: { children: ReactNode }) {
  return (
    <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
      {children}
    </tr>
  );
}

/**
 * Every date behind one line's number: a sentence on the left, the money on the
 * right.
 *
 * A nested `table-fixed` whose last column is right-aligned, so its amounts land
 * on the same axis as the total above them without having to agree with the
 * outer table's column widths — only with its right edge. It carries no header
 * row of its own: the outer table named its columns once already, and two values
 * a reader tells apart by shape — a dated week with words after it, and a sum of
 * money — do not need naming twice.
 */
export function DatedLinesTable({
  heading,
  children,
}: {
  /**
   * A fact about all the dates below — where they were — stated once above
   * them rather than on a line whose width is already spoken for.
   */
  heading: string | null;
  /** `DatedLine` rows. */
  children: ReactNode;
}) {
  return (
    <table className="w-full table-fixed text-xs">
      {/* The widths live in a `colgroup` rather than on the first row's cells,
          because the first row is not always a date: the heading spans the lot,
          and a fixed layout reading its widths off a spanning row would have
          none to read. */}
      <colgroup>
        <col className="w-[76%]" />
        <col className="w-[24%]" />
      </colgroup>
      <tbody>
        {heading !== null && (
          <tr>
            <td colSpan={2} className="py-1 text-muted-foreground">
              {heading}
            </td>
          </tr>
        )}
        {children}
      </tbody>
    </table>
  );
}

/** How a dated line reads: the ordinary case, settled-and-quiet, or flagged. */
export type DatedLineTone = "plain" | "muted" | "warning";

/**
 * One dated line: when it was and what became of it, read as one phrase, and
 * what it is worth.
 *
 * Day, week and outcome are one fact — *what became of this day* — joined by
 * the same middle dot the rest of the ledger joins a line's parts with. The
 * week rides with the date because a Finnish reader finds a session by its
 * week.
 *
 * **The tone is the whole row's rather than the outcome word's**, which is what
 * keeps the phrase one phrase: a warning-toned word after a plain date would
 * read as two facts about two different things, and the thing being flagged is
 * the day. A warning line carries the triangle before its outcome.
 */
export function DatedLine({
  date,
  isoWeek,
  locale,
  tone,
  context,
  outcome,
  note,
  amount,
}: {
  /** A bare calendar date, `YYYY-MM-DD`. */
  date: string;
  isoWeek: number;
  locale: string;
  tone: DatedLineTone;
  /** Which part of the line's thing this date belongs to, before the outcome. */
  context?: string | null;
  /** What became of the day. */
  outcome: string;
  /** A fact about the day after the outcome. */
  note?: string | null;
  /** The money column: a formatted amount, a flag, or nothing at all. */
  amount: ReactNode;
}) {
  const c = useTranslations("common");

  return (
    <tr
      className={cn(
        "align-baseline",
        tone === "muted" && "text-muted-foreground",
        tone === "warning" && "text-warning",
      )}
    >
      <td className="py-1 pr-2">
        <span className="flex flex-wrap items-baseline gap-x-1.5">
          <span>{formatDateOnly(date, locale, { weekday: "short" })}</span>
          <span className="tabular-nums">
            {formatDateOnly(date, locale, {
              day: "numeric",
              month: "numeric",
              year: "numeric",
            })}
          </span>
          <span className="tabular-nums">
            {SCHEDULE_PART_SEPARATOR}
            {c("week", { week: isoWeek })}
          </span>
          {context != null && (
            <span>
              {SCHEDULE_PART_SEPARATOR}
              {context}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            {SCHEDULE_PART_SEPARATOR}
            {tone === "warning" && (
              <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden />
            )}
            {outcome}
          </span>
          {note != null && (
            <span>
              {SCHEDULE_PART_SEPARATOR}
              {note}
            </span>
          )}
        </span>
      </td>
      {/* The money column, ending on the same axis as the line's own total. An
          amount with a word beside it flows leftward into the column's slack
          rather than pushing the figure off that axis. */}
      <td className="py-1 text-right tabular-nums">
        <span className="flex items-baseline justify-end gap-1.5">{amount}</span>
      </td>
    </tr>
  );
}
