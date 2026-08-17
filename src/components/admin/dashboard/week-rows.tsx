/* eslint-disable i18next/no-literal-string -- design-mock phase; see the note on
   `product-attention-grid.tsx`. */
import Link from "next/link";
import { AlertTriangle, PauseCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScheduleChip, ScheduleWeek } from "./admin-dashboard-data";
import { addCalendarDays, formatDayMonth, WEEKDAY_LABELS } from "./calendar";
import { PRODUCT_TYPE_PRESENTATION } from "./product-type-presentation";

/**
 * The week as seven stacked rows, Monday first.
 *
 * It was seven *columns* first, and columns lost on the only measure that
 * mattered: a seventh of the page is about a hundred and fifty pixels, and
 * almost every real club name — "Minecraft-kerho Kalasataman peruskoulu" —
 * truncated inside it. A schedule whose entries cannot be read is not a schedule.
 *
 * Rows invert the constraint. A row is as wide as the page, chips flow along it
 * and wrap, and each chip takes exactly the width its own name needs, so nothing
 * is ever cut. The comparison a grid was for survives in a different form: a
 * heavy Wednesday is a row three lines deep beside a Monday that is one, which
 * reads as "busy" at a glance just as a tall column did.
 *
 * The two questions the row is built to answer, in the order it answers them:
 * **what runs today** (the chip's time, tinted type glyph and full name) and
 * **does it need me** (the dot, the same fact as the queue at the top of the
 * page). It briefly answered a third — how full each session was — and that is
 * gone; see the chip below.
 */
export function WeekRows({
  week,
  todayIso,
}: {
  week: ScheduleWeek;
  /**
   * Today's calendar date, or `null` when the visible week is not the current
   * one. Passed in rather than computed so the highlight follows the page's
   * single `now` and cannot drift from the rest of the dashboard.
   */
  todayIso: string | null;
}) {
  const rows = WEEKDAY_LABELS.map((label, weekday) => {
    const date = addCalendarDays(week.weekStart, weekday);
    return {
      weekday,
      label,
      date,
      isToday: date === todayIso,
      chips: week.chips
        .filter((chip) => chip.weekday === weekday)
        .sort(byStartTimeThenName),
    };
  });

  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li
            key={row.date}
            className={cn(
              "flex flex-col gap-2 rounded-lg border p-2 sm:flex-row sm:gap-3",
              row.isToday
                ? "border-primary/60 bg-primary/5"
                : "border-border bg-card",
            )}
          >
            <div className="flex shrink-0 items-baseline gap-2 px-1 sm:w-24 sm:flex-col sm:items-start sm:gap-0">
              <span
                className={cn(
                  "text-sm font-semibold",
                  row.isToday ? "text-primary" : "text-foreground",
                )}
              >
                {row.label}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatDayMonth(row.date)}
              </span>
            </div>

            {row.chips.length === 0 ? (
              // No placeholder and no reserved height: an empty Sunday is a fact
              // about the week, and a ghost chip there would read as something
              // that failed to load.
              <p className="px-1 text-xs text-muted-foreground">Nothing on</p>
            ) : (
              <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                {row.chips.map((chip) => (
                  <li key={chip.id}>
                    <SessionChip chip={chip} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {week.onBreak.length > 0 && (
        // Kept under the whole week rather than pinned to a row: a paused club
        // is absent from every row it would have appeared in, so attaching the
        // line to one of them would say it once and imply it about the others.
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <PauseCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            <span className="font-medium">Paused this week:</span>{" "}
            {week.onBreak.join(", ")}
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * One session. Nothing on it is abbreviated: the name is whole, because the row
 * it sits in has the width of the page to give it and wrapping costs a line
 * rather than a fact.
 *
 * **The chip carries no seat figure.** A row holds fifteen to twenty of these,
 * and twenty healthy "12/16"s are twenty numbers the eye reads and discards on
 * the way to the name it came for. A signal-only version was built and cut too:
 * a figure that appears on a few chips and not the rest is a rule the reader has
 * to learn before the row means anything, which is a lot to charge for a number
 * nobody had asked for. The counts stay in the chip's `title`, where they cost
 * nothing and are there for anyone who wants one.
 *
 * The type is one mark rather than two: the sidebar's own glyph for that type,
 * tinted with that type's colour. At this density a bar plus a glyph would be
 * two marks saying one thing and would push the name a further pixel-eighth
 * along on every chip in the row.
 */
function SessionChip({ chip }: { chip: ScheduleChip }) {
  const presentation = PRODUCT_TYPE_PRESENTATION[chip.productType];
  const Icon = presentation.icon;

  return (
    <Link
      href={chip.href}
      title={`${presentation.label} · ${chip.productName} · ${chip.startTime}, ${chip.durationMinutes} min · ${chip.activeCount}${chip.seatCount === null ? "" : `/${chip.seatCount}`}`}
      className="flex items-center gap-1.5 rounded border border-border py-1 pl-1.5 pr-2 text-xs leading-tight transition-colors hover:border-foreground/30 hover:bg-accent"
    >
      <Icon
        className={cn("h-3.5 w-3.5 shrink-0", presentation.text)}
        aria-hidden
      />
      <span className="shrink-0 font-medium tabular-nums text-muted-foreground">
        {chip.startTime}
      </span>
      <span className="whitespace-nowrap">{chip.productName}</span>
      {chip.needsAttention && <AttentionMark />}
    </Link>
  );
}

/**
 * "This one is in the queue at the top of the page."
 *
 * It was a bare amber dot, which needed a key entry to mean anything — and a
 * mark that cannot be read without a key is a mark that is not read. The
 * replacement borrows the grammar the family surfaces already use to tell a
 * parent something is wrong with an enrollment (`PaymentProblemBadge`): a
 * `destructive`-coloured `AlertTriangle`, non-interactive, `role="img"` with the
 * explanation in its `aria-label` and `title`. A triangle is read as "problem"
 * by anyone who has used a computer; a dot is read as a dot.
 *
 * **Only the frame is left behind.** That badge is a solid `destructive` disc
 * straddling a card's top-right corner (`BADGE_FRAME`, 28px, half hanging off
 * the edge, with a background-coloured ring cutting it out). A chip in these
 * rows is about 22px tall and sits in a wrapping row of twenty, so a disc on its
 * corner would overlap its neighbours and outweigh the name beside it. The icon
 * and the colour — the two halves that carry the meaning — come across intact
 * at the chip's own scale; the disc was always geometry for a card.
 *
 * The `title` sits on a wrapping span rather than on the icon: an SVG ignores a
 * `title` *attribute* (it wants a `<title>` child), so putting it on the element
 * would have produced a tooltip that silently never appeared.
 */
function AttentionMark() {
  return (
    <span
      role="img"
      aria-label={ATTENTION_LABEL}
      title={ATTENTION_LABEL}
      className="inline-flex shrink-0"
    >
      <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-hidden />
    </span>
  );
}

const ATTENTION_LABEL =
  "Needs attention — this product is in the queue at the top of the page";

function byStartTimeThenName(a: ScheduleChip, b: ScheduleChip): number {
  if (a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1;
  return a.productName.localeCompare(b.productName);
}
