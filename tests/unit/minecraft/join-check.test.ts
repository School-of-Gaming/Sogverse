import { describe, it, expect } from "vitest";
import {
  buildJoinCheckResponse,
  normalizeMinecraftUuid,
  seatGrantsServerAccess,
  type JoinCheckSeat,
  type LinkedGamer,
} from "@/lib/minecraft/join-check";

const NOW = new Date("2026-10-08T12:00:00Z");

function seat(overrides: Partial<JoinCheckSeat> = {}): JoinCheckSeat {
  return {
    status: "active",
    billingMode: "paid",
    startDate: "2026-09-01",
    endDate: null,
    timezone: "Europe/Helsinki",
    ...overrides,
  };
}

describe("seatGrantsServerAccess", () => {
  it("admits an active seat on an open-ended paid product", () => {
    expect(seatGrantsServerAccess(seat(), NOW)).toBe(true);
  });

  it("refuses a free product", () => {
    expect(seatGrantsServerAccess(seat({ billingMode: "free" }), NOW)).toBe(false);
  });

  it("refuses a municipality club the family does not pay for", () => {
    expect(
      seatGrantsServerAccess(seat({ billingMode: "external_contract" }), NOW),
    ).toBe(false);
  });

  it.each(["waitlisted", "reserving", "completed"] as const)(
    "refuses a %s seat",
    (status) => {
      expect(seatGrantsServerAccess(seat({ status }), NOW)).toBe(false);
    },
  );

  it("admits a seat whose product ends later", () => {
    expect(seatGrantsServerAccess(seat({ endDate: "2026-10-09" }), NOW)).toBe(true);
  });

  it("refuses a seat whose product has ended", () => {
    expect(seatGrantsServerAccess(seat({ endDate: "2026-10-07" }), NOW)).toBe(false);
  });

  it("refuses a seat whose product has not started", () => {
    expect(seatGrantsServerAccess(seat({ startDate: "2026-10-09" }), NOW)).toBe(false);
  });

  it("admits on the start date itself", () => {
    expect(seatGrantsServerAccess(seat({ startDate: "2026-10-08" }), NOW)).toBe(true);
  });

  it("admits a single-day event on its day and no other", () => {
    const event = { startDate: "2026-10-08", endDate: "2026-10-08" };
    expect(seatGrantsServerAccess(seat(event), NOW)).toBe(true);
    expect(
      seatGrantsServerAccess(seat(event), new Date("2026-10-09T12:00:00Z")),
    ).toBe(false);
  });

  it("reads the start date in the product's own zone", () => {
    // 21:30 UTC on 8 October is already 00:30 on 9 October in Helsinki.
    expect(
      seatGrantsServerAccess(
        seat({ startDate: "2026-10-09" }),
        new Date("2026-10-08T21:30:00Z"),
      ),
    ).toBe(true);
  });

  describe("reads the end date in the product's own zone", () => {
    // 22:30 UTC on 8 October is already 01:30 on 9 October in Helsinki (UTC+3).
    const lateUtc = new Date("2026-10-08T22:30:00Z");

    it("refuses on the day after the end date locally, though UTC is still on it", () => {
      expect(seatGrantsServerAccess(seat({ endDate: "2026-10-08" }), lateUtc)).toBe(
        false,
      );
    });

    it("admits on the end date itself locally", () => {
      expect(seatGrantsServerAccess(seat({ endDate: "2026-10-09" }), lateUtc)).toBe(
        true,
      );
    });

    it("admits through the last minute of the end date", () => {
      // 20:59 UTC is 23:59 in Helsinki on the end date.
      expect(
        seatGrantsServerAccess(
          seat({ endDate: "2026-10-08" }),
          new Date("2026-10-08T20:59:00Z"),
        ),
      ).toBe(true);
    });
  });
});

describe("buildJoinCheckResponse", () => {
  const paid = { ...seat(), product: "Minecraft Bedrock Club", productType: "consumer_club" as const };
  const muni = {
    ...seat({ billingMode: "external_contract", startDate: "2026-08-15", endDate: "2026-12-15" }),
    product: "School Club",
    productType: "municipality_club" as const,
  };

  function gamer(firstName: string, seats: LinkedGamer["seats"]): LinkedGamer {
    return { firstName, minecraftUsername: `${firstName}MC`, seats };
  }

  it("lists qualifying seats first, then by start date", () => {
    const response = buildJoinCheckResponse(
      { linked: true, gamers: [gamer("Aino", [muni, paid])] },
      NOW,
    );
    expect(response.gamers[0].enrollments.map((e) => e.qualifies)).toEqual([
      true,
      false,
    ]);
    expect(response.message).toBe(
      "Allowed: Aino has a paid seat on Minecraft Bedrock Club.",
    );
  });

  it("names the linked gamers in a denial", () => {
    const response = buildJoinCheckResponse(
      { linked: true, gamers: [gamer("Eero", [muni]), gamer("Aino", [])] },
      NOW,
    );
    expect(response).toMatchObject({ allowed: false, reason: "no_paid_enrollment" });
    expect(response.message).toBe(
      "Denied: neither Aino nor Eero has a current paid seat.",
    );
  });
});

describe("normalizeMinecraftUuid", () => {
  const stored = "069a79f4-44e9-4726-a5be-fca90e38aaf5";

  it.each([stored, "069a79f444e94726a5befca90e38aaf5", stored.toUpperCase()])(
    "normalizes %s to the stored form",
    (raw) => {
      expect(normalizeMinecraftUuid(raw)).toBe(stored);
    },
  );

  it("refuses something that is not a uuid", () => {
    expect(normalizeMinecraftUuid("not-a-uuid")).toBeNull();
  });
});
