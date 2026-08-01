import { describe, expect, it } from "vitest";
import {
  GEDU_ACTIVITY_TYPE_ORDER,
  geduActivityTypeOf,
  groupAssignmentsByType,
  rollUpGeduAssignments,
  type GeduAssignmentRow,
} from "@/lib/gedu-assignment-rollup";
import { Constants } from "@/types/database.types";
import type { ProductType } from "@/types";

/**
 * The roll-up is what replaced the dashboard's per-occurrence enumeration, so
 * the things worth pinning are that it emits exactly one row per assignment,
 * that "next session" survives the in-progress case, and that the ordering puts
 * an imminent session at the top where a gedu will look for it.
 */

const TZ = "Europe/Helsinki";

function row(over: {
  id: string;
  name: string;
  /** 0 = Monday, matching the schedule_slots convention. */
  weekday?: number;
  startTime?: string;
  durationMinutes?: number;
  startDate?: string | null;
  endDate?: string | null;
  isRemote?: boolean;
  siteName?: string | null;
  slots?: GeduAssignmentRow["slots"];
}): GeduAssignmentRow {
  return {
    product: {
      id: over.id,
      timezone: TZ,
      startDate: over.startDate ?? "2025-01-06",
      endDate: over.endDate ?? null,
      padletUrl: null,
      isRemote: over.isRemote ?? true,
      productType: "consumer_club",
      translations: [{ locale: "en", name: over.name, description: "" }],
    },
    groupId: `${over.id}-group`,
    groupCount: 2,
    gamerCount: 14,
    groupName: `${over.name} A`,
    groupGamerCount: 7,
    siteName: over.siteName ?? null,
    slots:
      over.slots ??
      [
        {
          weekday: over.weekday ?? 0,
          startTime: over.startTime ?? "16:30",
          durationMinutes: over.durationMinutes ?? 90,
        },
      ],
  };
}

function rollUp(
  rows: GeduAssignmentRow[],
  now: Date,
  extra: Partial<Parameters<typeof rollUpGeduAssignments>[0]> = {},
) {
  return rollUpGeduAssignments({
    rows,
    now,
    locale: "en",
    hrefByProductId: Object.fromEntries(
      rows.map((r) => [r.product.id, `/preview/gedu-product/${r.product.id}`]),
    ),
    ...extra,
  });
}

describe("rollUpGeduAssignments", () => {
  // Wednesday 11 Feb 2026, 11:00 Helsinki.
  const now = new Date("2026-02-11T09:00:00Z");

  it("emits exactly one summary per assignment, not one per occurrence", () => {
    // The whole point of the roll-up: a weekly club used to produce eight rows.
    const summaries = rollUp([row({ id: "p1", name: "Monday Club" })], now);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      productId: "p1",
      groupId: "p1-group",
      productName: "Monday Club",
      groupName: "Monday Club A",
      groupGamerCount: 7,
    });
  });

  it("collapses a five-slot camp week to one card", () => {
    const summaries = rollUp(
      [
        row({
          id: "camp",
          name: "Builders Camp",
          slots: [0, 1, 2, 3, 4].map((weekday) => ({
            weekday,
            startTime: "10:00",
            durationMinutes: 180,
          })),
          startDate: "2026-02-09",
          endDate: "2026-02-20",
        }),
      ],
      now,
    );
    expect(summaries).toHaveLength(1);
    expect(summaries[0].nextSessionStart).not.toBeNull();
  });

  it("carries the next occurrence, including one in progress right now", () => {
    // Wednesday 16:45 Helsinki, inside a 16:30–18:00 Wednesday slot.
    const midSession = new Date("2026-02-11T14:45:00Z");
    const summaries = rollUp(
      [row({ id: "p1", name: "Wednesday Club", weekday: 2 })],
      midSession,
    );
    const { nextSessionStart, voiceIsOpen } = summaries[0];
    expect(nextSessionStart).not.toBeNull();
    // The in-progress session is the soonest meaningful moment, so the card
    // shows it rather than skipping a week — and its window is open.
    expect(nextSessionStart!.getTime()).toBeLessThan(midSession.getTime());
    expect(voiceIsOpen).toBe(true);
  });

  it("reports no next session once an end-dated product has finished", () => {
    const summaries = rollUp(
      [
        row({
          id: "over",
          name: "Finished Camp",
          startDate: "2025-06-02",
          endDate: "2025-06-13",
        }),
      ],
      now,
    );
    expect(summaries[0].nextSessionStart).toBeNull();
    expect(summaries[0].nextSessionEnd).toBeNull();
    expect(summaries[0].voiceIsOpen).toBe(false);
  });

  it("reports no next session for an assignment with no slots", () => {
    const summaries = rollUp(
      [row({ id: "empty", name: "Unscheduled Club", slots: [] })],
      now,
    );
    expect(summaries[0].nextSessionStart).toBeNull();
  });

  it("sorts by soonest next session ascending", () => {
    // Thursday before Friday before Monday, from a Wednesday.
    const summaries = rollUp(
      [
        row({ id: "mon", name: "Monday", weekday: 0 }),
        row({ id: "fri", name: "Friday", weekday: 4 }),
        row({ id: "thu", name: "Thursday", weekday: 3 }),
      ],
      now,
    );
    expect(summaries.map((s) => s.productId)).toEqual(["thu", "fri", "mon"]);
  });

  it("sinks assignments with nothing scheduled to the bottom", () => {
    const summaries = rollUp(
      [
        row({ id: "none", name: "Unscheduled", slots: [] }),
        row({ id: "mon", name: "Monday", weekday: 0 }),
      ],
      now,
    );
    expect(summaries.map((s) => s.productId)).toEqual(["mon", "none"]);
  });

  it("takes the attention count from the caller and defaults it to zero", () => {
    const summaries = rollUp(
      [row({ id: "p1", name: "A" }), row({ id: "p2", name: "B" })],
      now,
      { attentionByProductId: { p1: 3 } },
    );
    const byId = new Map(summaries.map((s) => [s.productId, s.attentionCount]));
    expect(byId.get("p1")).toBe(3);
    expect(byId.get("p2")).toBe(0);
  });

  it("gives an in-person product an inert Join href", () => {
    const summaries = rollUp(
      [row({ id: "onsite", name: "Onsite Club", isRemote: false })],
      now,
      { voiceHrefByProductId: { onsite: "/voice/group/onsite-group" } },
    );
    expect(summaries[0].voiceHref).toBe("#");
  });

  it("falls back to an inert Join href when the caller supplies none", () => {
    const summaries = rollUp([row({ id: "p1", name: "A" })], now);
    expect(summaries[0].voiceHref).toBe("#");
  });

  it("uses the caller's per-product open href", () => {
    const summaries = rollUp([row({ id: "p1", name: "A" })], now);
    expect(summaries[0].openHref).toBe("/preview/gedu-product/p1");
  });

  it("never reports an open voice window on a product with no room", () => {
    // A card lights up on this flag, so an in-person assignment reporting an
    // open window would announce a room that does not exist. The window is a
    // fact about a room, and an in-person product has none to be inside.
    const summaries = rollUp(
      [
        row({
          id: "onsite",
          name: "Onsite Camp",
          isRemote: false,
          // Mid-session right now, which is exactly when the window would
          // otherwise report itself open.
          weekday: 2,
          startTime: "10:30",
          durationMinutes: 180,
        }),
      ],
      now,
    );
    expect(summaries[0].hasVoiceRoom).toBe(false);
    expect(summaries[0].voiceIsOpen).toBe(false);
  });
});

/**
 * The dashboard stopped having one umbrella heading and now renders one section
 * per type noun. Which sections exist, and in what order, is entirely this
 * function's answer — so an empty group leaking through would put a heading on
 * the page with nothing under it, and a reordering would move a gedu's clubs
 * below their events between two deploys.
 */
describe("geduActivityTypeOf", () => {
  it("folds both club types into one noun", () => {
    // A gedu standing in the room cannot tell a consumer club from a
    // municipality one, and has no reason to: the difference is who pays.
    expect(geduActivityTypeOf("consumer_club")).toBe("club");
    expect(geduActivityTypeOf("municipality_club")).toBe("club");
  });

  it("maps the other two product types to themselves", () => {
    expect(geduActivityTypeOf("camp")).toBe("camp");
    expect(geduActivityTypeOf("event")).toBe("event");
  });

  it("covers every product type the schema can produce", () => {
    // Derived from the generated enum rather than a hand-kept list, so a fifth
    // product type fails here instead of silently falling out of the dashboard.
    for (const type of Constants.public.Enums.product_type) {
      expect(GEDU_ACTIVITY_TYPE_ORDER, type).toContain(geduActivityTypeOf(type));
    }
  });
});

describe("groupAssignmentsByType", () => {
  const typed = (id: string, productType: ProductType) => ({ id, productType });
  const typeOf = (item: { productType: ProductType }) => item.productType;

  it("emits clubs, then camps, then events", () => {
    const groups = groupAssignmentsByType(
      [typed("e", "event"), typed("c", "camp"), typed("k", "consumer_club")],
      typeOf,
    );
    expect(groups.map((g) => g.type)).toEqual(["club", "camp", "event"]);
  });

  it("skips the nouns a gedu does not run rather than emitting empties", () => {
    // An empty heading on a personal dashboard reads as something missing; a
    // club gedu should never learn that events exist.
    const groups = groupAssignmentsByType(
      [typed("k1", "consumer_club"), typed("k2", "municipality_club")],
      typeOf,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe("club");
    expect(groups[0].items.map((i) => i.id)).toEqual(["k1", "k2"]);
  });

  it("preserves the caller's order inside each group", () => {
    // The roll-up already sorted soonest-first; regrouping must not reshuffle.
    const groups = groupAssignmentsByType(
      [
        typed("k1", "consumer_club"),
        typed("c1", "camp"),
        typed("k2", "consumer_club"),
        typed("c2", "camp"),
      ],
      typeOf,
    );
    expect(groups[0].items.map((i) => i.id)).toEqual(["k1", "k2"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["c1", "c2"]);
  });

  it("returns nothing at all for a gedu with no assignments", () => {
    expect(groupAssignmentsByType([], typeOf)).toEqual([]);
  });
});
