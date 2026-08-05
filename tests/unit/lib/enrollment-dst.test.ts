import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getNextSessionStart } from "@/lib/enrollment";

/**
 * DST-transition regression. The next-occurrence walk once stepped its
 * candidate days by fixed 24-hour instant increments, which assumes every
 * local day is 24 hours. On the fall-back day (25 hours) the same calendar
 * date appeared at two offsets — and the second match bypassed the
 * "already passed today" guard, returning an already-finished session as
 * "next". On the spring-forward day (23 hours) a date could be skipped
 * outright, losing that week's session. The fix iterates calendar dates
 * (year-month-day arithmetic, which never skips or repeats) and converts
 * each candidate to an instant at the end.
 *
 * The old bug only fired when the *runtime* zone crossed the transition
 * mid-walk — it was invisible on a UTC runner — so this file pins TZ to
 * Europe/Helsinki, the zone our products and users actually live in. The
 * fixed implementation is runtime-zone independent, so these assertions
 * hold even where the TZ pin is not honored.
 *
 * Why a dedicated file: Vitest spawns a fresh worker per file by default,
 * and we set `process.env.TZ` in `beforeAll` so subsequent date math in
 * this worker reads the new zone. Bundling these into enrollment.test.ts
 * would silently shift the rest of that file's clock too.
 */

describe("getNextSessionStart — DST transition days (runtime TZ = Europe/Helsinki)", () => {
  let originalTZ: string | undefined;

  beforeAll(() => {
    originalTZ = process.env.TZ;
    process.env.TZ = "Europe/Helsinki";
  });

  afterAll(() => {
    process.env.TZ = originalTZ;
  });

  it("does not return a finished session on the fall-back day (25-hour day)", () => {
    // Helsinki falls back Sunday 2026-10-25 (04:00 EEST → 03:00 EET), so
    // that local day is 25 hours long. `now` sits in the day's first hour:
    // Sunday 00:30 EEST = 2026-10-24T21:30:00Z. The Sunday 00:15 slot has
    // just finished. The buggy instant-stepping walk found Sunday again at
    // offset 1 (00:30 + 24h real lands on Sunday 23:30 EET — same date),
    // skipped the offset-0 past-guard, and returned the 00:15 start that
    // was already 15 minutes in the past.
    const now = new Date("2026-10-24T21:30:00Z");
    const result = getNextSessionStart(
      { dayOfWeek: 6, startTime: "00:15", timezone: "Europe/Helsinki" },
      { now },
    );

    // Hard invariant: strictly future, or enumerateRowOccurrences emits a
    // finished session into every upcoming list.
    expect(result.getTime()).toBeGreaterThan(now.getTime());
    // Specifically next Sunday: 2026-11-01 00:15 EET = 2026-10-31T22:15Z.
    expect(result.toISOString()).toBe("2026-10-31T22:15:00.000Z");
  });

  it("does not skip a session on the spring-forward day (23-hour day)", () => {
    // Helsinki springs forward Sunday 2026-03-29 (03:00 EET → 04:00 EEST).
    // `now` is Saturday 23:30 EET = 2026-03-28T21:30:00Z. The buggy walk's
    // offset-1 candidate (23:30 + 24h real) crossed the transition and
    // landed on Monday 00:30 EEST — Sunday's date never appeared, so a
    // Sunday slot resolved a week late and that week's session vanished.
    const now = new Date("2026-03-28T21:30:00Z");
    const result = getNextSessionStart(
      { dayOfWeek: 6, startTime: "10:00", timezone: "Europe/Helsinki" },
      { now },
    );

    // Tomorrow's session, not next week's: 2026-03-29 10:00 EEST = 07:00Z.
    expect(result.toISOString()).toBe("2026-03-29T07:00:00.000Z");
  });

  it("returns a strictly-future start for every weekday across the whole fall-back day", () => {
    // Sweep `now` across all 25 hours of the fall-back day for every
    // weekday slot, at the slot time (00:15) most exposed to the repeated-
    // date bug. The strictly-future contract is what the occurrence
    // enumeration in src/lib/session-occurrence.ts leans on.
    const dayStart = new Date("2026-10-24T21:00:00Z"); // Sun 00:00 EEST
    for (let hour = 0; hour < 25; hour++) {
      const now = new Date(dayStart.getTime() + hour * 3_600_000 + 30 * 60_000);
      for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek++) {
        const result = getNextSessionStart(
          { dayOfWeek, startTime: "00:15", timezone: "Europe/Helsinki" },
          { now },
        );
        expect(result.getTime()).toBeGreaterThan(now.getTime());
      }
    }
  });
});
