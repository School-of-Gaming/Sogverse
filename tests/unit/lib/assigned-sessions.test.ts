import { describe, it, expect } from "vitest";

import { expandAssignedSessionsToCards } from "@/lib/assigned-sessions";
import type { MyAssignedProductSessionRow } from "@/services/assignments";

// Mirrors `tests/unit/lib/upcoming-sessions.test.ts`. The gedu adapter
// shares the slot-expansion contract with the parent/gamer adapter
// (cap, in-progress carryover, DST, start/end-date bounds), so the
// tests here focus on the surface differences: no gamer field, the
// gedu-specific group/gamer counts pass through unchanged, and
// `voiceIsOpen` is set on the first item only.

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";
const GROUP_ID = "22222222-2222-2222-2222-222222222222";

function makeRow(
  overrides: Partial<MyAssignedProductSessionRow> = {},
): MyAssignedProductSessionRow {
  return {
    product: {
      id: PRODUCT_ID,
      timezone: "UTC",
      startDate: null,
      endDate: null,
      padletUrl: null,
      isRemote: true,
      translations: [
        {
          locale: "en",
          name: "Minecraft Club",
          description: "",
        },
      ],
      ...(overrides.product ?? {}),
    },
    groupId: overrides.groupId ?? GROUP_ID,
    groupCount: overrides.groupCount ?? 3,
    gamerCount: overrides.gamerCount ?? 12,
    slots: overrides.slots ?? [
      { weekday: 2, startTime: "15:00", durationMinutes: 60 }, // Wed 15:00 UTC
    ],
  };
}

describe("expandAssignedSessionsToCards", () => {
  it("returns [] when there are no rows", () => {
    expect(
      expandAssignedSessionsToCards([], new Date("2026-02-25T08:00:00Z"), "en"),
    ).toEqual([]);
  });

  it("skips assignments with zero slots", () => {
    const row = makeRow({ slots: [] });
    expect(
      expandAssignedSessionsToCards(
        [row],
        new Date("2026-02-25T08:00:00Z"),
        "en",
      ),
    ).toEqual([]);
  });

  it("emits one item per future occurrence and caps open-ended products at 8", () => {
    const row = makeRow({
      slots: [
        { weekday: 1, startTime: "15:00", durationMinutes: 60 }, // Tue
        { weekday: 3, startTime: "15:00", durationMinutes: 60 }, // Thu
      ],
    });
    const out = expandAssignedSessionsToCards(
      [row],
      new Date("2026-02-25T08:00:00Z"), // Wed morning
      "en",
    );
    expect(out).toHaveLength(8);
    // 4 calendar weeks of Tue+Thu starting Thu 2026-02-26.
    expect(out[0].sessionStart.toISOString()).toBe("2026-02-26T15:00:00.000Z");
    expect(out[7].sessionStart.toISOString()).toBe("2026-03-24T15:00:00.000Z");
  });

  it("emits every occurrence up to and including end_date for end-dated products", () => {
    const row = makeRow({
      product: {
        id: PRODUCT_ID,
        timezone: "UTC",
        startDate: null,
        endDate: "2026-03-08",
        padletUrl: null,
        isRemote: true,
        translations: [
          {
            locale: "en",
            name: "Spring Camp",
            description: "",
          },
        ],
      },
      slots: [{ weekday: 6, startTime: "10:00", durationMinutes: 60 }], // Sun
    });
    const out = expandAssignedSessionsToCards(
      [row],
      new Date("2026-02-25T08:00:00Z"),
      "en",
    );
    expect(out.map((s) => s.sessionStart.toISOString())).toEqual([
      "2026-03-01T10:00:00.000Z",
      "2026-03-08T10:00:00.000Z",
    ]);
  });

  it("merges and sorts sessions across multiple assignments", () => {
    const rowA = makeRow({
      slots: [{ weekday: 2, startTime: "15:00", durationMinutes: 60 }], // Wed 15:00
    });
    const rowB = makeRow({
      product: {
        id: "33333333-3333-3333-3333-333333333333",
        timezone: "UTC",
        startDate: null,
        endDate: null,
        padletUrl: null,
        isRemote: true,
        translations: [
          {
            locale: "en",
            name: "Other Club",
            description: "",
          },
        ],
      },
      slots: [{ weekday: 3, startTime: "10:00", durationMinutes: 60 }], // Thu 10:00
    });
    const out = expandAssignedSessionsToCards(
      [rowA, rowB],
      new Date("2026-02-23T08:00:00Z"), // Monday
      "en",
    );
    expect(out.slice(0, 4).map((s) => s.sessionStart.toISOString())).toEqual([
      "2026-02-25T15:00:00.000Z", // Wed (Minecraft)
      "2026-02-26T10:00:00.000Z", // Thu (Other)
      "2026-03-04T15:00:00.000Z",
      "2026-03-05T10:00:00.000Z",
    ]);
  });

  it("sets voiceIsOpen on the first item only", () => {
    // Window opens at 14:55 for a 15:00 start. Two-slot open-ended product
    // emits 8 items; only the soonest gets the live flag set.
    const row = makeRow({
      slots: [
        { weekday: 2, startTime: "15:00", durationMinutes: 60 }, // Wed
        { weekday: 4, startTime: "15:00", durationMinutes: 60 }, // Fri
      ],
    });
    const out = expandAssignedSessionsToCards(
      [row],
      new Date("2026-02-25T14:55:00Z"), // Wed 14:55 — window just opened
      "en",
    );
    expect(out[0].voiceIsOpen).toBe(true);
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i].voiceIsOpen).toBe(false);
    }
  });

  it("keeps an in-progress session at the top with voiceIsOpen=true", () => {
    const row = makeRow({
      slots: [{ weekday: 2, startTime: "15:00", durationMinutes: 60 }], // Wed 15:00-16:00
    });
    const out = expandAssignedSessionsToCards(
      [row],
      new Date("2026-02-25T15:30:00Z"), // 30 min in
      "en",
    );
    expect(out[0].sessionStart.toISOString()).toBe("2026-02-25T15:00:00.000Z");
    expect(out[0].voiceIsOpen).toBe(true);
  });

  it("forwards productId, groupId, groupCount and gamerCount onto every item", () => {
    const row = makeRow({ groupCount: 5, gamerCount: 23 });
    const out = expandAssignedSessionsToCards(
      [row],
      new Date("2026-02-25T08:00:00Z"),
      "en",
    );
    expect(out.length).toBeGreaterThan(1);
    for (const item of out) {
      expect(item.productId).toBe(PRODUCT_ID);
      expect(item.groupId).toBe(GROUP_ID);
      expect(item.groupCount).toBe(5);
      expect(item.gamerCount).toBe(23);
    }
  });

  it("leaves voiceHref and openGroupHref as '#' placeholders for now", () => {
    // The /gedu/voice/[id] page and per-group detail page are both out of
    // scope until the dashboard wires them up — see TODO.md.
    const row = makeRow();
    const out = expandAssignedSessionsToCards(
      [row],
      new Date("2026-02-25T08:00:00Z"),
      "en",
    );
    expect(out[0].voiceHref).toBe("#");
    expect(out[0].openGroupHref).toBe("#");
  });

  it("resolves the product name against the requested locale, falling back to en", () => {
    const row = makeRow({
      product: {
        id: PRODUCT_ID,
        timezone: "UTC",
        startDate: null,
        endDate: null,
        padletUrl: null,
        isRemote: true,
        translations: [
          {
            locale: "en",
            name: "Minecraft Club",
            description: "",
          },
          {
            locale: "fi",
            name: "Minecraft-kerho",
            description: "",
          },
        ],
      },
    });
    const now = new Date("2026-02-25T08:00:00Z");
    expect(expandAssignedSessionsToCards([row], now, "fi")[0].productName).toBe(
      "Minecraft-kerho",
    );
    expect(expandAssignedSessionsToCards([row], now, "sv")[0].productName).toBe(
      "Minecraft Club",
    );
  });

  it("does not emit phantom sessions before start_date", () => {
    // Same regression as the parent adapter's start_date test — a camp
    // whose slot weekday matches today must not emit an in-progress
    // entry before start_date actually opens.
    const row = makeRow({
      product: {
        id: PRODUCT_ID,
        timezone: "Europe/Helsinki",
        startDate: "2026-05-26",
        endDate: "2026-06-25",
        padletUrl: null,
        isRemote: true,
        translations: [
          {
            locale: "en",
            name: "Kyle's Tech Camp",
            description: "",
          },
        ],
      },
      slots: [
        { weekday: 0, startTime: "10:00", durationMinutes: 180 }, // Mon
        { weekday: 2, startTime: "10:00", durationMinutes: 180 }, // Wed
        { weekday: 4, startTime: "10:00", durationMinutes: 180 }, // Fri
      ],
    });
    const out = expandAssignedSessionsToCards(
      [row],
      new Date("2026-05-15T08:30:00Z"), // Fri before start_date
      "en",
    );
    expect(out[0].sessionStart.toISOString()).toBe("2026-05-27T07:00:00.000Z");
    expect(out[0].voiceIsOpen).toBe(false);
  });
});
