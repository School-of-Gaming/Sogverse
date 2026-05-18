import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getNextSessionStart } from "@/lib/enrollment";

/**
 * Non-UTC runtime regression. The sibling enrollment.test.ts file covers
 * happy-path behavior on whatever timezone Vitest happens to be running in;
 * this file specifically pins runtime TZ to Australia/Sydney so the suite
 * catches the class of bug where date math on `toZonedTime` results uses
 * UTC accessors instead of local ones.
 *
 * Why a dedicated file: Vitest spawns a fresh worker per file by default,
 * and we set `process.env.TZ` in `beforeAll` so subsequent `new Date(...)`
 * constructions in this worker read the new zone. Bundling these tests into
 * enrollment.test.ts would silently shift the rest of that file's clock too.
 */

describe("getNextSessionStart — non-UTC runtime regression", () => {
  let originalTZ: string | undefined;

  beforeAll(() => {
    originalTZ = process.env.TZ;
    // Australia/Sydney is UTC+10/+11, well away from UTC and from
    // Europe/Helsinki — large enough offset that a buggy implementation
    // misreading wall-clock components will land on the wrong calendar day
    // for almost any source-zone time.
    process.env.TZ = "Australia/Sydney";
  });

  afterAll(() => {
    process.env.TZ = originalTZ;
  });

  it("returns a strictly-future occurrence when cursor sits just past today's slot start", () => {
    // The infinite-loop scenario that pegged /parent. The caller in
    // enumerateOccurrences (src/lib/upcoming-sessions.ts) advances its
    // cursor by `start + 60s` after each emitted occurrence; if a later
    // call returns a `start` <= cursor, the cursor never moves and the
    // while-loop spins forever. Reproducer: Monday 08:01 Helsinki summer
    // (1 minute past the 08:00 slot start).
    const cursor = new Date("2026-05-25T05:01:00Z");
    const result = getNextSessionStart(
      { dayOfWeek: 0, startTime: "08:00", timezone: "Europe/Helsinki" },
      { now: cursor },
    );

    // Hard invariant: result must advance the cursor. Without this,
    // enumerateOccurrences infinite-loops and the renderer pegs.
    expect(result.getTime()).toBeGreaterThan(cursor.getTime());
    // And specifically: next Monday is 2026-06-01 08:00 Helsinki = 05:00 UTC.
    expect(result.toISOString()).toBe("2026-06-01T05:00:00.000Z");
  });
});
