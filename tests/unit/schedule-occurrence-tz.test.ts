import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  dateTimeInstant,
  nextOccurrenceInstant,
  viewerWeekdayIndex,
} from "@/lib/schedule-occurrence";

/**
 * Non-UTC runtime regression for the viewer-schedule occurrence helpers.
 * They once read `getUTC*` fields off `toZonedTime` results — which agree
 * with the zone's wall clock only on a UTC runtime. In a non-UTC browser
 * the reading is shifted by the runtime offset, and once that shift
 * crosses midnight the weekday is wrong: the sibling
 * schedule-occurrence.test.ts passed only because every case there uses
 * midday times. These cases pin the near-midnight band.
 *
 * Why a dedicated file: Vitest spawns a fresh worker per file by default,
 * and we set `process.env.TZ` in `beforeAll` so subsequent date math in
 * this worker reads the new zone. (Sydney, matching enrollment-tz.test.ts:
 * far from UTC and from Helsinki.) The fixed implementation is
 * runtime-zone independent, so these assertions hold even where the TZ
 * pin is not honored.
 */

describe("schedule-occurrence — non-UTC runtime regression (TZ = Australia/Sydney)", () => {
  let originalTZ: string | undefined;

  beforeAll(() => {
    originalTZ = process.env.TZ;
    process.env.TZ = "Australia/Sydney";
  });

  afterAll(() => {
    process.env.TZ = originalTZ;
  });

  it("viewerWeekdayIndex re-groups a Helsinki evening slot to the viewer's next day", () => {
    // Monday 18:00 Helsinki (EEST) = Tuesday 01:00 in Sydney — the exact
    // "a Helsinki slot shifts to a different viewer weekday" case the
    // viewer re-grouping exists for. The getUTC* reading subtracted the
    // runtime offset, crossed midnight backwards, and answered Monday.
    const instant = dateTimeInstant("2026-08-03", "18:00", "Europe/Helsinki");
    expect(viewerWeekdayIndex(instant, "Europe/Helsinki")).toBe(0); // Monday
    expect(viewerWeekdayIndex(instant, "Australia/Sydney")).toBe(1); // Tuesday
  });

  it("nextOccurrenceInstant skips today's occurrence when now is early on the slot's weekday", () => {
    // Now: Tuesday 01:00 Helsinki (EEST) = Monday 22:00 UTC. A Tuesday
    // 18:00 slot must resolve to *next* Tuesday (the contract is strictly
    // the next occurrence, today excluded). The getUTC* reading saw
    // Monday, computed daysAhead = 1, and returned today's occurrence.
    const now = new Date("2026-08-03T22:00:00Z");
    const instant = nextOccurrenceInstant(1, "18:00", "Europe/Helsinki", now);
    // Tuesday Aug 11, 18:00 EEST = 15:00 UTC.
    expect(instant.toISOString()).toBe("2026-08-11T15:00:00.000Z");
  });
});
