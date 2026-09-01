import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { getNextSessionStart, stepBackOneWeek } from "@/lib/enrollment";

/**
 * Shared building blocks for resolving "what session does this slot
 * point to right now?" — the bit of expansion logic the family and gedu
 * roll-ups both need — **and for saying which occurrence one is**, which
 * every feed that merges stored rows over projections has to agree on.
 *
 * Each consumer handles iteration differently (a feed walks a whole term
 * of them, a dashboard card collapses to the soonest), so we share the
 * awkward pieces — the prev-week-in-window check, the date-to-cutoff
 * conversions and the identity helpers — and let the callers iterate.
 *
 * Role-agnostic on purpose. Every session feed in the app is built out
 * of these, and a second copy of any of them in a per-role module is how
 * two surfaces end up disagreeing about which day a session happened on.
 */

/**
 * `YYYY-MM-DD` as the instant falls in the **product's own zone**.
 *
 * The zone is the product's rather than the viewer's because this is an
 * identity, not a rendering: it is the key a stored row and a projected
 * occurrence meet on, and both sides of that merge have to name the same
 * day whoever is looking. Anything shown to a reader converts to the
 * viewer's zone later, from the instant.
 */
export function productLocalDate(instant: Date, timezone: string): string {
  return formatInTimeZone(instant, timezone, "yyyy-MM-dd");
}

/**
 * A feed entry's stable id: the group, and the product-local date it
 * happened on.
 *
 * **A session is a (group, product-local date)** — that is the row's
 * unique key in Postgres and it is the entry's identity here, so a
 * projection and a row for the same day are the same thing and meet on
 * the same map key. Deliberately not the row's primary key, because most
 * entries have no row, and the ones that do acquire one the moment
 * anything is written against them — which would change the id of the
 * card being typed into. `${group}:${date}` is the same string before and
 * after materialization, which is what lets a scroll anchor, an open
 * editor and React's own reconciliation survive a save.
 *
 * The date also survives the most common schedule edit there is —
 * somebody fixing the time of day — which keying by instant or by slot
 * start would not.
 */
export function sessionEntryId(groupId: string, sessionDate: string): string {
  return `${groupId}:${sessionDate}`;
}

export interface SlotShape {
  weekday: number;
  startTime: string;
  durationMinutes: number;
}

/**
 * The **last occurrence a product's schedule projects on or before its end
 * date**, as a bare `YYYY-MM-DD`, or `null` when the run has no final session
 * at all.
 *
 * There is no stored final-session flag anywhere — occurrences come from the
 * schedule — so "the final session" has to be derived, and it is derived here
 * so the one client that needs it and the SQL that computes the dashboard's
 * count answer the same question the same way. **The two are twins and must
 * stay so**: the assignment-summaries RPC walks the same seven-day window with
 * the same weekday test, and a change to either half is a change to both.
 *
 * Three properties, each of which the SQL shares:
 *
 * - **An open-ended product has none.** A club with no end date has no last
 *   session, so this answers `null` and anything gated on it never fires. That
 *   is documented behaviour, not an error.
 * - **Seven days ending at `endDate`, floored at `startDate`, is the whole
 *   search.** Slots are weekly, so a run of a week or more has every weekday
 *   inside that window and a shorter run is wholly inside it — which makes the
 *   maximum over the window the maximum over the run, at a bounded cost.
 * - **Pure calendar arithmetic, UTC-pinned.** Both bounds are bare dates with no
 *   time of day, so there is no zone to convert through and no DST to step over;
 *   the walk is `Date.UTC` day arithmetic, exactly as the root `CLAUDE.md` asks
 *   of a zoneless date. The weekday convention is the app's own — 0 is Monday —
 *   which is what `EXTRACT(ISODOW …) - 1` produces on the SQL side.
 */
export function finalSessionDate(args: {
  slots: readonly { weekday: number }[];
  /** Product-local `YYYY-MM-DD`, or `null` on a run with no declared start. */
  startDate: string | null;
  /** Product-local `YYYY-MM-DD`, or `null` on an open-ended run. */
  endDate: string | null;
}): string | null {
  const { slots, startDate, endDate } = args;
  if (endDate === null || slots.length === 0) return null;

  const weekdays = new Set(slots.map((slot) => slot.weekday));
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(end)) return null;

  for (let back = 0; back < 7; back++) {
    const day = new Date(end - back * 86_400_000);
    const date = utcCalendarDate(day);
    // Below the product's own start there is nothing left to find: the run had
    // not begun. Bare-date string comparison is a calendar comparison.
    if (startDate !== null && date < startDate) return null;
    // `getUTCDay()` is 0 = Sunday; the app's slots are 0 = Monday.
    if (weekdays.has((day.getUTCDay() + 6) % 7)) return date;
  }
  return null;
}

/**
 * A UTC-pinned instant back as its own `YYYY-MM-DD`.
 *
 * Written out of the `getUTC*` fields rather than sliced off an ISO string, so
 * the shape of the call cannot be mistaken for the banned
 * `new Date().toISOString().slice(0, 10)` — which is the same characters
 * standing for a completely different, and wrong, thing: somebody's local date
 * read in UTC. This one is only ever handed a date that was UTC-pinned when it
 * was built.
 */
function utcCalendarDate(instant: Date): string {
  const month = String(instant.getUTCMonth() + 1).padStart(2, "0");
  const day = String(instant.getUTCDate()).padStart(2, "0");
  return `${instant.getUTCFullYear()}-${month}-${day}`;
}

/**
 * If the slot's *previous* occurrence is still inside its voice window
 * right now (and within the product's start/end-date bounds), return
 * it. Otherwise null — callers fall through to `getNextSessionStart`
 * for the soonest future occurrence.
 *
 * Why this exists at all: `getNextSessionStart` always returns a
 * *future* occurrence — once today's start has passed, it skips to next
 * week. That hides currently-in-progress sessions from upcoming lists.
 * Mirroring `computeSessionWindow`, we check the prev-week candidate
 * explicitly.
 *
 * Why the DST-safe back-step (`stepBackOneWeek`): a flat `now - 7×24h`
 * lands one hour off on the DST-transition Wednesday (Helsinki
 * EET→EEST is the live example) — the back-stepped point sits *after*
 * last week's slot start in local time, so `getNextSessionStart`
 * returns last week's already-finished session and the in-window check
 * fails. Today's in-progress session disappears from the dashboard.
 * The regression is pinned in `tests/unit/session-schedule.test.ts`, by
 * the spring-forward case that reads a room's state mid-session: revert
 * the week step to a flat 7×24h and that file — and only that file —
 * goes red.
 *
 * Returns null when the product hasn't started yet
 * (`startBoundary > now`) — no prev-week occurrence can be in
 * progress in that case. Belt and braces with the `afterStart` check
 * below, which rejects the same occurrence one step later; either alone
 * is enough, which is why breaking one of them on its own leaves the
 * suite green.
 */
export function getCurrentInProgressOccurrence(args: {
  slot: SlotShape;
  timezone: string;
  now: Date;
  startBoundary: Date | null;
  endBoundary: Date | null;
  windowCloseMs: number;
}): { start: Date; end: Date } | null {
  const { slot, timezone, now, startBoundary, endBoundary, windowCloseMs } = args;

  if (startBoundary !== null && startBoundary.getTime() > now.getTime()) {
    return null;
  }

  const schedule = {
    dayOfWeek: slot.weekday,
    startTime: slot.startTime,
    timezone,
  };
  const durationMs = slot.durationMinutes * 60_000;

  const prevStart = getNextSessionStart(schedule, {
    now: stepBackOneWeek(now, timezone),
  });
  const prevEnd = new Date(prevStart.getTime() + durationMs);

  const withinWindow = prevEnd.getTime() + windowCloseMs > now.getTime();
  const afterStart =
    startBoundary === null || prevStart.getTime() >= startBoundary.getTime();
  const beforeEnd =
    endBoundary === null || prevStart.getTime() <= endBoundary.getTime();

  if (withinWindow && afterStart && beforeEnd) {
    return { start: prevStart, end: prevEnd };
  }
  return null;
}

/**
 * Turn a product's wall-clock start_date (YYYY-MM-DD in `timezone`) into
 * the UTC instant of that local day's midnight. Sessions whose start is
 * at or after this instant qualify; anything earlier is before the
 * product actually begins running.
 */
export function startDateToCutoff(
  startDate: string | null,
  timezone: string,
): Date | null {
  if (startDate === null) return null;
  return fromZonedTime(`${startDate}T00:00:00.000`, timezone);
}

/**
 * Inclusive UTC cutoff for `endDate`'s local end-of-day in `timezone`.
 * Any session whose start is on or before this instant counts. End-of-
 * day rather than start-of-day keeps a slot whose session falls on
 * `end_date` itself in the list.
 */
export function endDateToCutoff(
  endDate: string | null,
  timezone: string,
): Date | null {
  if (endDate === null) return null;
  return fromZonedTime(`${endDate}T23:59:59.999`, timezone);
}

/**
 * Default cap for open-ended products (no `end_date`) — the parent/gamer
 * Sessions list and the gedu My Groups list both surface the next N
 * occurrences across all of a product's weekly slots. End-dated products
 * (camps, events, dated runs) ignore the cap and emit every occurrence
 * up to and including `end_date`.
 *
 * Shared so the gedu's view of a club shows the same horizon as the
 * parent's.
 */
export const OPEN_ENDED_OCCURRENCE_CAP = 8;

/**
 * How far forward a single slot is ever walked in one call.
 *
 * The mirror of `MAX_PAST_OCCURRENCES_PER_SLOT` below, and the same number for
 * the same reason: ten years of weekly sessions is comfortably past any product
 * that could exist and far short of anything that costs a frame. It is a guard
 * rail, not a product horizon — the real bound is the caller's `endBoundary`,
 * and every caller asking for an uncapped walk is expected to pass one.
 */
export const MAX_FUTURE_OCCURRENCES_PER_SLOT = 520;

/**
 * The earlier of two optional UTC cutoffs — typically a product's own end date
 * and a cancelled subscription's paid-through instant. `null` on one side means
 * "no bound there", so the other wins; both null means unbounded.
 *
 * Lives here, beside the `*DateToCutoff` helpers whose output it composes,
 * because both family dashboards clamp a cancelled enrollment with it and a
 * verbatim copy in each was a semantic fix waiting to land in only one of them.
 */
export function earlierBoundary(a: Date | null, b: Date | null): Date | null {
  if (a === null) return b;
  if (b === null) return a;
  return a.getTime() <= b.getTime() ? a : b;
}

/**
 * Expand one row's slots into the concrete (start, end) pairs every
 * dashboard and feed consumes, on both the family and the gedu side —
 * the only difference between those callers was the per-row card
 * shaping, not the iteration.
 *
 * Per-slot it first surfaces a still-in-its-window previous occurrence
 * (the bit `getNextSessionStart` hides because it only ever returns
 * *future* starts), then walks forward emitting future occurrences
 * until either `endBoundary` is crossed or `cap` is reached. Per-slot
 * lists are merged, sorted ascending, and trimmed to `cap` so the
 * soonest N across all slots win.
 *
 * `cap = Infinity` means "no cap" — used for end-dated products where
 * the date range is the natural bound.
 *
 * **`Infinity` is bounded here, not by the caller's good behaviour.** An
 * uncapped walk terminates only when `endBoundary` stops it, so `cap:
 * Infinity` paired with a null boundary is an infinite loop. Every caller
 * today does supply a boundary alongside `Infinity` — a product's end date,
 * or a cancelled subscription's paid-through instant — but that invariant
 * lived in five call sites and nowhere near the `while` it protects, so it
 * was one refactor away from being false. `MAX_FUTURE_OCCURRENCES_PER_SLOT`
 * enforces it where the loop is, exactly as `maxOccurrences` does for the
 * backward walker below; an unbounded loop in an expansion helper is how
 * this codebase once pegged a renderer at 100% CPU.
 */
export function enumerateRowOccurrences(args: {
  slots: SlotShape[];
  timezone: string;
  now: Date;
  startBoundary: Date | null;
  endBoundary: Date | null;
  cap: number;
  windowCloseMs: number;
}): Array<{ start: Date; end: Date }> {
  const { slots, timezone, now, startBoundary, endBoundary, cap, windowCloseMs } =
    args;
  const out: Array<{ start: Date; end: Date }> = [];
  // The requested cap, floored by the hard ceiling. A finite `cap` is almost
  // always far below it, so the ceiling only ever bites on an uncapped walk
  // whose `endBoundary` failed to stop it — which is the case it exists for.
  const perSlotCap = Math.min(
    Number.isFinite(cap) ? cap : Number.POSITIVE_INFINITY,
    MAX_FUTURE_OCCURRENCES_PER_SLOT,
  );

  // If the product hasn't started yet (start_date is in the future), pin
  // the future-iteration cursor to "just before start_date" so the
  // search lands on or after start_date. Otherwise iterate from real
  // `now`. The prev-week-in-window check returns null in the
  // not-started-yet case on its own (no occurrence can be in progress
  // before the product opens), so no separate guard is needed here.
  const futureCursorBase =
    startBoundary !== null && startBoundary.getTime() > now.getTime()
      ? new Date(startBoundary.getTime() - 1)
      : now;

  for (const slot of slots) {
    const schedule = {
      dayOfWeek: slot.weekday,
      startTime: slot.startTime,
      timezone,
    };
    const durationMs = slot.durationMinutes * 60_000;

    let emitted = 0;

    const inProgress = getCurrentInProgressOccurrence({
      slot,
      timezone,
      now,
      startBoundary,
      endBoundary,
      windowCloseMs,
    });
    if (inProgress) {
      out.push(inProgress);
      emitted += 1;
    }

    let cursor = futureCursorBase;
    while (emitted < perSlotCap) {
      const start = getNextSessionStart(schedule, { now: cursor });
      if (endBoundary !== null && start.getTime() > endBoundary.getTime()) break;
      const end = new Date(start.getTime() + durationMs);
      out.push({ start, end });
      // Step past this start so the next iteration finds the following
      // occurrence rather than re-emitting this one. `getNextSessionStart`
      // is required to return a strictly future date relative to `now`;
      // see its TZ regression test — if that contract slips, this loop
      // never advances and the renderer pegs.
      cursor = new Date(start.getTime() + 60_000);
      emitted += 1;
    }
  }

  out.sort((a, b) => a.start.getTime() - b.start.getTime());
  return Number.isFinite(cap) ? out.slice(0, cap) : out;
}

/**
 * Walk a row's slots **backward** from `now`, emitting every occurrence whose
 * start falls at or after `floor`.
 *
 * The forward helpers above only ever answer "what is coming", which is all the
 * dashboards ever needed: an occurrence with nothing recorded against it had no
 * reason to exist once it was over. A session feed is the opposite question —
 * it is a history, read newest-first — so it needs the same slots walked the
 * other way, and it needs the walk to be as DST-safe as the forward one.
 *
 * **Holiday-blind, deliberately.** It expands weekday slots and nothing else,
 * matching the live dashboards' expansion rather than the calendar component's
 * holiday-aware one. A feed that hid a listed holiday while the write path
 * still accepted a record for it (or vice versa) would produce sessions a gedu
 * can neither see nor clear.
 *
 * The walk is bounded twice over — by `floor` and by `maxOccurrences` — because
 * a schedule with no start date would otherwise be an unbounded loop, and an
 * unbounded loop in an expansion helper is how this codebase once pegged a
 * renderer at 100% CPU.
 *
 * Returns ascending (oldest first), matching `enumerateRowOccurrences`; a feed
 * that wants newest-first reverses it, so the two helpers can be concatenated
 * before either is ordered for display.
 */
export function enumeratePastRowOccurrences(args: {
  slots: SlotShape[];
  timezone: string;
  now: Date;
  /**
   * Oldest instant worth emitting — the product's start boundary, floored by
   * whatever else the caller cares about. Occurrences starting before this are
   * not emitted.
   */
  floor: Date;
  /** Latest instant the product runs, if it is end-dated. */
  endBoundary: Date | null;
  /** Hard stop per slot, so a bad `floor` cannot become an infinite walk. */
  maxOccurrences: number;
}): Array<{ start: Date; end: Date }> {
  const { slots, timezone, now, floor, endBoundary, maxOccurrences } = args;
  const out: Array<{ start: Date; end: Date }> = [];

  for (const slot of slots) {
    const schedule = {
      dayOfWeek: slot.weekday,
      startTime: slot.startTime,
      timezone,
    };
    const durationMs = slot.durationMinutes * 60_000;

    // `getNextSessionStart` is strictly forward-looking, so the way to find the
    // most recent past occurrence is to ask it from a week ago and step back a
    // week at a time. Starting from `now` itself would return the *next* one.
    let searchPoint = stepBackOneWeek(now, timezone);
    let emitted = 0;

    while (emitted < maxOccurrences) {
      const start = getNextSessionStart(schedule, { now: searchPoint });
      if (start.getTime() < floor.getTime()) break;

      const withinRun =
        endBoundary === null || start.getTime() <= endBoundary.getTime();
      // An occurrence still in the future (or past the product's end) is not
      // this walk's business, but it must not stop it either: the first
      // candidate can land after `now` when the slot's day is later this week.
      if (start.getTime() < now.getTime() && withinRun) {
        out.push({ start, end: new Date(start.getTime() + durationMs) });
        emitted += 1;
      }

      searchPoint = stepBackOneWeek(searchPoint, timezone);
    }
  }

  out.sort((a, b) => a.start.getTime() - b.start.getTime());
  return out;
}

/**
 * How far back a single slot is ever walked in one call.
 *
 * Ten years of weekly sessions — comfortably past the oldest club that could
 * exist and far short of anything that costs a frame. It is a guard rail, not a
 * product horizon: the real bound is the product's start date, and every caller
 * is expected to pass one.
 */
export const MAX_PAST_OCCURRENCES_PER_SLOT = 520;

/**
 * How far back an **undated** product's history is projected.
 *
 * Nearly every product carries a start date and that is the floor the backward
 * walk really wants; `start_date` is nullable for open-ended clubs, though, and
 * a missing one cannot mean "walk to the beginning of time" — the backward
 * helper would then run to its 520-occurrence guard rail and hand a feed ten
 * years of dashed placeholder lines for a club nobody claims ran that long.
 *
 * A year is the honest answer to "how much history can we assume without being
 * told": long enough that a club running a full term or three reads completely,
 * short enough that a feed is not inventing a decade. Stored rows are never
 * subject to it — a row older than this still renders, because a row is a fact
 * rather than a projection.
 */
export const UNDATED_PRODUCT_PAST_HORIZON_DAYS = 365;

/** The backward floor for a product that never declared a start date. */
export function undatedPastFloor(now: Date): Date {
  return new Date(
    now.getTime() - UNDATED_PRODUCT_PAST_HORIZON_DAYS * 24 * 60 * 60 * 1000,
  );
}
