import { describe, it, expect } from "vitest";
import { buildCustomerEnrollment } from "@/components/customer/CustomerGroupDetailContent";
import type { GroupWithVoice } from "@/hooks/use-groups-page";

/** Minimal GroupWithVoice with only the fields buildCustomerEnrollment reads. */
function makeGroup(
  gamers: { gamerId: string; displayName: string; enrollmentId: string; lastChargeSessionDate: string | null }[],
  overrides?: Partial<GroupWithVoice>,
): GroupWithVoice {
  return {
    groupId: "g1",
    productId: "p1",
    productName: "Test Product",
    productDescription: "",
    productImagePath: "",
    productPadletUrl: null,
    productMinAge: 8,
    productMaxAge: 14,
    productTokenCost: 5,
    gameId: "game1",
    gameName: "Test Game",
    geduId: "gedu1",
    geduName: "Ms. Smith",
    dayOfWeek: 1,
    startTime: "14:00:00",
    timezone: "America/New_York",
    durationMinutes: 60,
    displayOrder: 0,
    voiceRoomId: "vr-1",
    voiceIsOpen: false,
    voiceNextSessionStart: new Date(),
    gamers: gamers.map((g) => ({
      ...g,
      dateOfBirth: null,
      gender: null,
    })),
    ...overrides,
  };
}

describe("buildCustomerEnrollment", () => {
  const gamerB = { id: "gamer-b", display_name: "Gamer B" };
  const gamerC = { id: "gamer-c", display_name: "Gamer C" };
  const myGamers = [gamerB, gamerC];

  const group = makeGroup([
    { gamerId: "gamer-b", displayName: "Gamer B", enrollmentId: "e-b", lastChargeSessionDate: null },
    { gamerId: "gamer-c", displayName: "Gamer C", enrollmentId: "e-c", lastChargeSessionDate: "2026-03-10" },
    { gamerId: "gamer-other", displayName: "Other Kid", enrollmentId: "e-other", lastChargeSessionDate: null },
  ]);

  it("selects the targeted gamer when two siblings are in the same group", () => {
    const result = buildCustomerEnrollment(group, myGamers, "gamer-c");

    expect(result).toEqual({
      enrollmentId: "e-c",
      tokenCost: 5,
      gamerDisplayName: "Gamer C",
      lastChargeSessionDate: "2026-03-10",
    });
  });

  it("selects gamer B when targeted", () => {
    const result = buildCustomerEnrollment(group, myGamers, "gamer-b");

    expect(result).toEqual({
      enrollmentId: "e-b",
      tokenCost: 5,
      gamerDisplayName: "Gamer B",
      lastChargeSessionDate: null,
    });
  });

  it("returns undefined when targetGamerId is not in the group roster", () => {
    const result = buildCustomerEnrollment(group, myGamers, "gamer-nonexistent");

    expect(result).toBeUndefined();
  });

  it("returns undefined when targetGamerId is in roster but not owned by customer", () => {
    const result = buildCustomerEnrollment(group, myGamers, "gamer-other");

    expect(result).toBeUndefined();
  });

  it("returns undefined when group has no gamers", () => {
    const emptyGroup = makeGroup([]);
    const result = buildCustomerEnrollment(emptyGroup, myGamers, "gamer-b");

    expect(result).toBeUndefined();
  });

  it("falls back to productTokenCost ?? 0 when token cost is null", () => {
    const nullCostGroup = makeGroup(
      [{ gamerId: "gamer-b", displayName: "Gamer B", enrollmentId: "e-b", lastChargeSessionDate: null }],
      { productTokenCost: null },
    );

    const result = buildCustomerEnrollment(nullCostGroup, myGamers, "gamer-b");

    expect(result?.tokenCost).toBe(0);
  });
});
