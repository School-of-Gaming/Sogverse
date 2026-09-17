import { describe, it, expect } from "vitest";

import { compareKeys } from "@/lib/api/partner-cursor.server";
import {
  feedbackSessionDate,
  isEmptyFeedback,
} from "@/services/partner/partner-feedback.server";

describe("feedbackSessionDate", () => {
  it("is the product-local day the session starts on, not the day its window opened", () => {
    // Opens 23:55 on 8 November in Helsinki (UTC+2), starts at midnight.
    expect(feedbackSessionDate("2026-11-08T21:55:00+00:00", "Europe/Helsinki")).toBe(
      "2026-11-09",
    );
    // The same instant is still 8 November in New York.
    expect(feedbackSessionDate("2026-11-08T21:55:00+00:00", "America/New_York")).toBe(
      "2026-11-08",
    );
  });

  it("reads the day in the product's zone across a DST change", () => {
    // 25 October 2026: Helsinki falls back from UTC+3 to UTC+2. The same UTC
    // clock face starts a session at midnight before the change and at 23:00
    // after it, so the two land on different sides of their local midnight.
    expect(feedbackSessionDate("2026-10-23T20:55:00+00:00", "Europe/Helsinki")).toBe(
      "2026-10-24",
    );
    expect(feedbackSessionDate("2026-10-25T20:55:00+00:00", "Europe/Helsinki")).toBe(
      "2026-10-25",
    );
  });
});

describe("isEmptyFeedback", () => {
  it("is empty only with no rating and no note worth the name", () => {
    expect(isEmptyFeedback({}, "")).toBe(true);
    expect(isEmptyFeedback({}, " \n\t")).toBe(true);
    expect(isEmptyFeedback({}, "ok")).toBe(false);
    expect(isEmptyFeedback({ fun: 3 }, "")).toBe(false);
  });
});

describe("the feedback key order", () => {
  // The page reader checks a fetch's rows against `compareKeys`, and the
  // database sorts them itself; the two must agree or every page 500s. These are
  // the forms PostgREST emits a timestamptz in (UTC session: `+00:00`, trailing
  // fractional zeros trimmed, microsecond precision).
  const emitted = [
    "2026-10-19T05:55:00+00:00",
    "2026-10-19T05:55:00.000001+00:00",
    "2026-10-19T05:55:00.05+00:00",
    "2026-10-19T05:55:00.1+00:00",
    "2026-10-19T05:55:00.123456+00:00",
    "2026-10-19T05:55:00.5+00:00",
    "2026-10-19T05:55:01+00:00",
    "2026-10-19T05:56:00+00:00",
    "2026-10-19T15:00:00+00:00",
    "2026-10-20T00:00:00+00:00",
    "2027-01-01T00:00:00+00:00",
  ];

  /** The instant, to the microsecond, as an integer. */
  function micros(value: string): bigint {
    const [whole, fraction = ""] = value.replace("+00:00", "").split(".");
    return BigInt(Date.parse(`${whole}Z`)) * BigInt(1000) + BigInt(fraction.padEnd(6, "0"));
  }

  it("orders PostgREST timestamps as the instants they name", () => {
    const shuffled = [...emitted].reverse();
    const byKey = [...shuffled].sort((a, b) => compareKeys(a, b));
    const byInstant = [...shuffled].sort((a, b) => (micros(a) < micros(b) ? -1 : 1));
    expect(byKey).toEqual(byInstant);
    expect(byKey).toEqual(emitted);
  });

  it("orders uuids as their bytes, which is the database's uuid order", () => {
    const ids = [
      "0fffffff-ffff-4fff-bfff-ffffffffffff",
      "10000000-0000-4000-8000-000000000000",
      "a0000000-0000-4000-8000-000000000000",
      "f0000000-0000-4000-8000-000000000000",
    ];
    const byKey = [...ids].reverse().sort((a, b) => compareKeys(a, b));
    const byBytes = [...ids]
      .reverse()
      .sort((a, b) => Buffer.compare(Buffer.from(a.replace(/-/g, ""), "hex"), Buffer.from(b.replace(/-/g, ""), "hex")));
    expect(byKey).toEqual(byBytes);
  });

  it("compares the composite key column by column", () => {
    const participant = "20000000-0000-4000-8000-000000000001";
    const group = "50000000-0000-4000-8000-000000000001";
    expect(
      compareKeys(
        [participant, group, "2026-10-19T05:55:00+00:00"],
        [participant, group, "2026-10-19T05:55:00.5+00:00"],
      ),
    ).toBeLessThan(0);
  });
});
