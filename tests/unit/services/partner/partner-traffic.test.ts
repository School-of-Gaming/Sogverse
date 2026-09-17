import { describe, it, expect, vi } from "vitest";

import { PartnerQueryError } from "@/lib/api/partner-auth.server";
import {
  buildTrafficPage,
  earliestTrafficDay,
  productPagePaths,
  resolveTrafficRange,
} from "@/services/partner/partner-traffic.server";

// The module caches through Next's data cache, which does not exist outside a
// Next server; nothing here reaches it.
vi.mock("next/cache", () => ({ unstable_cache: vi.fn() }));

const PRODUCT = "10000000-0000-4000-8000-000000000001";
const RANGE = { from: "2026-09-01", to: "2026-09-14" };

describe("resolveTrafficRange", () => {
  const now = new Date("2026-09-17T23:30:00Z");

  it("defaults to the thirty UTC days ending today", () => {
    expect(resolveTrafficRange(undefined, undefined, now)).toEqual({
      from: "2026-08-19",
      to: "2026-09-17",
    });
  });

  it("counts thirty days back from a named end, and keeps a named start", () => {
    expect(resolveTrafficRange(undefined, "2026-08-01", now)).toEqual({
      from: "2026-07-03",
      to: "2026-08-01",
    });
    expect(resolveTrafficRange("2026-09-01", undefined, now)).toEqual({
      from: "2026-09-01",
      to: "2026-09-17",
    });
    expect(resolveTrafficRange("2026-09-01", "2026-09-02", now)).toEqual({
      from: "2026-09-01",
      to: "2026-09-02",
    });
  });

  it("clamps a range reaching before the counts begin to the earliest day kept", () => {
    expect(resolveTrafficRange("2020-01-01", undefined, now)).toEqual({
      from: "2026-05-31",
      to: "2026-09-17",
    });
    // A defaulted start that falls before the counts begin clamps the same way.
    expect(resolveTrafficRange(undefined, "2026-06-10", now)).toEqual({
      from: "2026-05-31",
      to: "2026-06-10",
    });
  });

  it("clamps a range reaching past today to today", () => {
    expect(resolveTrafficRange("2026-09-01", "9999-12-31", now)).toEqual({
      from: "2026-09-01",
      to: "2026-09-17",
    });
  });

  it("refuses a from later than the to a default completed, naming from", () => {
    const read = () => resolveTrafficRange("2027-01-01", undefined, now);
    expect(read).toThrow(PartnerQueryError);
    expect(read).toThrow(/^from: .*today \(2026-09-17\)/);
  });

  it("refuses a range that shares no day with the counts", () => {
    const before = () => resolveTrafficRange("2020-01-01", "2020-12-31", now);
    expect(before).toThrow(PartnerQueryError);
    expect(before).toThrow(/^to: must be on or after 2026-05-31/);

    const after = () => resolveTrafficRange("2027-01-01", "2027-02-01", now);
    expect(after).toThrow(PartnerQueryError);
    expect(after).toThrow(/^from: must be on or before today \(2026-09-17\)/);

    const defaultedAfter = () => resolveTrafficRange(undefined, "2030-01-01", now);
    expect(defaultedAfter).toThrow(/^from: defaults to .*2029-12-03/);
  });
});

describe("earliestTrafficDay", () => {
  it("is the day analytics was switched on until two years of retention pass it", () => {
    expect(earliestTrafficDay(new Date("2026-09-17T23:30:00Z"))).toBe("2026-05-31");
    expect(earliestTrafficDay(new Date("2028-05-31T12:00:00Z"))).toBe("2026-05-31");
    expect(earliestTrafficDay(new Date("2028-09-17T00:00:00Z"))).toBe("2026-09-17");
  });
});

describe("productPagePaths", () => {
  it("is the product page in every locale's slug, plus the pre-locale shop path", () => {
    expect(productPagePaths(PRODUCT).sort()).toEqual(
      [
        `/en/shop/${PRODUCT}`,
        `/fi/kauppa/${PRODUCT}`,
        `/sv/butik/${PRODUCT}`,
        `/fr/boutique/${PRODUCT}`,
        `/tlh/shop/${PRODUCT}`,
        `/shop/${PRODUCT}`,
      ].sort(),
    );
  });
});

describe("buildTrafficPage", () => {
  it("normalises empty UTM values to null, merges them, and orders the splits", () => {
    const page = buildTrafficPage("landing", null, RANGE, {
      byCampaign: [
        { values: { utmCampaign: "" }, pageviews: 900 },
        { values: { utmCampaign: "lynx-autumn-b" }, pageviews: 50 },
        { values: { utmCampaign: "lynx-autumn-a" }, pageviews: 50 },
        { values: { utmCampaign: "Lynx-Autumn-A" }, pageviews: 0 },
      ],
      bySourceMedium: [
        { values: { utmSource: "", utmMedium: "" }, pageviews: 900 },
        { values: { utmSource: "lynx", utmMedium: "email" }, pageviews: 70 },
        { values: { utmSource: "lynx", utmMedium: "" }, pageviews: 30 },
      ],
      byDay: [
        { values: { day: "2026-09-02" }, pageviews: 600 },
        { values: { day: "2026-09-01" }, pageviews: 400 },
        { values: { day: "2026-09-03" }, pageviews: 0 },
      ],
    });

    expect(page).toEqual({
      page: "landing",
      product_id: null,
      pageviews: 1000,
      // Most views first, ties by value, the untagged row last.
      by_campaign: [
        { utm_campaign: "lynx-autumn-a", pageviews: 50 },
        { utm_campaign: "lynx-autumn-b", pageviews: 50 },
        { utm_campaign: null, pageviews: 900 },
      ],
      by_source_medium: [
        { utm_source: "lynx", utm_medium: "email", pageviews: 70 },
        { utm_source: "lynx", utm_medium: null, pageviews: 30 },
        { utm_source: null, utm_medium: null, pageviews: 900 },
      ],
      by_day: [
        { date: "2026-09-01", pageviews: 400 },
        { date: "2026-09-02", pageviews: 600 },
      ],
    });
  });

  it("refuses splits that do not sum to the same total", () => {
    const reads = {
      byCampaign: [{ values: { utmCampaign: "" }, pageviews: 10 }],
      bySourceMedium: [{ values: { utmSource: "", utmMedium: "" }, pageviews: 10 }],
      byDay: [{ values: { day: "2026-09-01" }, pageviews: 10 }],
    };
    expect(buildTrafficPage("shop", null, RANGE, reads)).not.toBeNull();
    expect(
      buildTrafficPage("shop", null, RANGE, {
        ...reads,
        byDay: [{ values: { day: "2026-09-01" }, pageviews: 11 }],
      }),
    ).toBeNull();
    expect(
      buildTrafficPage("shop", null, RANGE, {
        ...reads,
        bySourceMedium: [{ values: { utmSource: "", utmMedium: "" }, pageviews: 9 }],
      }),
    ).toBeNull();
  });

  it("throws on a day outside the range rather than dropping its views", () => {
    expect(() =>
      buildTrafficPage("product", PRODUCT, RANGE, {
        byCampaign: [{ values: { utmCampaign: "" }, pageviews: 1 }],
        bySourceMedium: [{ values: { utmSource: "", utmMedium: "" }, pageviews: 1 }],
        byDay: [{ values: { day: "2026-09-15" }, pageviews: 1 }],
      }),
    ).toThrow(/outside/);
  });

  it("answers an unviewed page with zero and empty splits", () => {
    expect(
      buildTrafficPage("shop", null, RANGE, { byCampaign: [], bySourceMedium: [], byDay: [] }),
    ).toEqual({
      page: "shop",
      product_id: null,
      pageviews: 0,
      by_campaign: [],
      by_source_medium: [],
      by_day: [],
    });
  });
});
