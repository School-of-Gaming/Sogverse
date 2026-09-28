import { describe, it, expect } from "vitest";

import { CONSENT_DOCUMENTS } from "@/lib/constants/consent-documents";
import type { LocationWithChain } from "@/services/locations/locations.service";
import {
  LIVE_SEAT_STATUSES,
  PROGRAMME_AGE_RANGE,
  PROGRAMME_PRIVACY_SLUG,
  PROGRAMME_TERMS_SLUG,
  isRecordedSession,
  isRobloxUrl,
  reportedEnrolmentStatus,
  resolvePlace,
  toUtcIso,
} from "@/services/partner/partner-shared-values";

describe("the Programme", () => {
  it("is scoped by the registry's own Programme documents", () => {
    expect(PROGRAMME_TERMS_SLUG).toBe("roblox-programme-terms");
    expect(PROGRAMME_PRIVACY_SLUG).toBe("roblox-privacy-policy");
    expect(CONSENT_DOCUMENTS[PROGRAMME_TERMS_SLUG]).toBeDefined();
    expect(CONSENT_DOCUMENTS[PROGRAMME_PRIVACY_SLUG]).toBeDefined();
  });

  it("serves 13 to 17", () => {
    expect(PROGRAMME_AGE_RANGE).toEqual({ min: 13, max: 17 });
  });

  it("counts every held seat live, never a reservation", () => {
    expect([...LIVE_SEAT_STATUSES].sort()).toEqual(["active", "completed", "waitlisted"]);
  });
});

describe("reportedEnrolmentStatus", () => {
  it("reports an active seat on a completed product as completed", () => {
    expect(reportedEnrolmentStatus("active", "completed")).toBe("completed");
  });

  it.each(["pending", "running"] as const)(
    "leaves an active seat active on a %s product",
    (productStatus) => {
      expect(reportedEnrolmentStatus("active", productStatus)).toBe("active");
    },
  );

  it("keeps a stored completion and a waitlist place as they are", () => {
    expect(reportedEnrolmentStatus("completed", "running")).toBe("completed");
    expect(reportedEnrolmentStatus("waitlisted", "completed")).toBe("waitlisted");
  });
});

describe("toUtcIso", () => {
  it("normalises PostgREST's offset form to Z", () => {
    expect(toUtcIso("2026-09-01T10:00:00+00:00")).toBe("2026-09-01T10:00:00.000Z");
    expect(toUtcIso("2026-09-01T13:00:00.5+03:00")).toBe("2026-09-01T10:00:00.500Z");
  });

  it("throws on a value that is not a timestamp", () => {
    expect(() => toUtcIso("yesterday")).toThrow();
  });
});

describe("isRobloxUrl", () => {
  it.each([
    "https://www.roblox.com/games/123/My-Game",
    "http://roblox.com/games/1",
    "https://ROBLOX.com/share?code=x",
    "https://create.roblox.com/dashboard",
  ])("accepts %s", (url) => {
    expect(isRobloxUrl(url)).toBe(true);
  });

  it.each([
    "https://roblox.com.evil.example/games/1",
    "https://evilroblox.com/games/1",
    "https://example.com/roblox.com",
    "https://roblox.com@example.com/",
    "ftp://roblox.com/file",
    "javascript:alert('roblox.com')",
    "roblox.com/games/1",
    "not a url",
  ])("refuses %s", (url) => {
    expect(isRobloxUrl(url)).toBe(false);
  });
});

describe("isRecordedSession", () => {
  it("counts a written report or any attendance mark", () => {
    expect(isRecordedSession("We built an obby", 0)).toBe(true);
    expect(isRecordedSession(null, 1)).toBe(true);
  });

  it("does not count a row with neither", () => {
    expect(isRecordedSession(null, 0)).toBe(false);
    expect(isRecordedSession("  \n ", 0)).toBe(false);
  });
});

describe("resolvePlace", () => {
  const node = (
    id: string,
    type: LocationWithChain["type"],
    name: string,
    country_code: string | null,
  ) => ({
    id,
    name,
    name_i18n: null,
    type,
    parent_id: null,
    country_code,
    external_code: null,
  });

  const location = (
    self: ReturnType<typeof node>,
    ancestors: ReturnType<typeof node>[],
  ): LocationWithChain => ({
    ...self,
    created_at: "2026-01-01T00:00:00+00:00",
    updated_at: "2026-01-01T00:00:00+00:00",
    ancestors,
  });

  const france = node("c", "country", "France", "FR");
  const idf = node("r", "region", "Île-de-France", "FR");
  const paris = node("m", "municipality", "Paris", "FR");

  it("names a municipality itself", () => {
    expect(resolvePlace(location(paris, [idf, france]))).toEqual({
      place: { city: "Paris", country_code: "FR" },
      country_code: "FR",
    });
  });

  it("names the nearest municipality above a site or a district", () => {
    const site = node("s", "site", "Lycée Victor Hugo", "FR");
    const district = node("d", "district", "Paris 3e", "FR");
    expect(resolvePlace(location(site, [district, paris, idf, france])).place).toEqual({
      city: "Paris",
      country_code: "FR",
    });
  });

  it("has no place above the municipality level, but keeps the country", () => {
    expect(resolvePlace(location(idf, [france]))).toEqual({
      place: null,
      country_code: "FR",
    });
  });
});
