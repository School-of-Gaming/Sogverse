import { describe, it, expect } from "vitest";
import {
  deriveRegistrationState,
  type RegistrationStateInputs,
} from "@/components/public/products/derive-registration-state";

// Test fixtures only need the columns the deriver reads. Default to a
// running consumer club with registration already open and no caps so
// each test only has to override the columns it cares about.
function product(
  over: Partial<RegistrationStateInputs>,
): RegistrationStateInputs {
  return {
    status: "running",
    start_date: "2026-04-01",
    end_date: "2026-12-31",
    signup_threshold: null,
    timezone: "Europe/Helsinki",
    registration_opens_at: "2026-01-01T00:00:00Z",
    seat_count: null,
    waitlist_enabled: false,
    product_type: "consumer_club",
    ...over,
  };
}

const NOW = new Date("2026-04-29T12:00:00Z");

describe("deriveRegistrationState", () => {
  it("ended → completed product (end_date in past)", () => {
    const state = deriveRegistrationState({
      product: product({
        status: "completed",
        start_date: "2026-01-01",
        end_date: "2026-02-01",
      }),
      now: NOW,
      participationsCount: 0,
    });
    expect(state.kind).toBe("ended");
  });

  it("ended → cancelled product", () => {
    const state = deriveRegistrationState({
      product: product({ status: "cancelled" }),
      now: NOW,
      participationsCount: 0,
    });
    expect(state.kind).toBe("ended");
  });

  it("ended → effectiveStatus rolls running into completed once end_date passes", () => {
    const state = deriveRegistrationState({
      product: product({
        status: "running",
        start_date: "2026-01-01",
        end_date: "2026-02-01",
      }),
      now: NOW,
      participationsCount: 0,
    });
    expect(state.kind).toBe("ended");
  });

  it("closed_pre → registration_opens_at in future", () => {
    const state = deriveRegistrationState({
      product: product({
        status: "pending",
        registration_opens_at: "2026-05-15T00:00:00Z",
      }),
      now: NOW,
      participationsCount: 0,
    });
    expect(state.kind).toBe("closed_pre");
    if (state.kind === "closed_pre") {
      expect(state.opensAt).toBe("2026-05-15T00:00:00Z");
    }
  });

  it("running_late → camp that already started locks late joins", () => {
    const state = deriveRegistrationState({
      product: product({
        product_type: "camp",
        status: "running",
        start_date: "2026-04-01",
        end_date: "2026-05-30",
      }),
      now: NOW,
      participationsCount: 0,
    });
    expect(state.kind).toBe("running_late");
  });

  it("running_late → event that already started locks late joins", () => {
    const state = deriveRegistrationState({
      product: product({
        product_type: "event",
        status: "running",
        start_date: "2026-04-29",
        end_date: "2026-04-29",
      }),
      now: NOW,
      participationsCount: 0,
    });
    expect(state.kind).toBe("running_late");
  });

  it("clubs do NOT lock late joins when running — drop in any time", () => {
    const state = deriveRegistrationState({
      product: product({
        product_type: "consumer_club",
        status: "running",
      }),
      now: NOW,
      participationsCount: 0,
    });
    expect(state.kind).toBe("open");
  });

  it("pending_thr → pending product with unmet threshold", () => {
    const state = deriveRegistrationState({
      product: product({
        status: "pending",
        signup_threshold: 5,
        // start_date in future so effectiveStatus stays pending
        start_date: "2026-06-01",
        end_date: "2026-08-30",
      }),
      now: NOW,
      participationsCount: 2,
    });
    expect(state.kind).toBe("pending_thr");
    if (state.kind === "pending_thr") {
      expect(state.threshold).toBe(5);
      expect(state.count).toBe(2);
    }
  });

  it("pending_thr flips to open once threshold met (effectiveStatus promotes)", () => {
    // start_date past + threshold met → effectiveStatus = running → open
    const state = deriveRegistrationState({
      product: product({
        status: "pending",
        signup_threshold: 5,
        start_date: "2026-04-01",
        end_date: "2026-08-30",
      }),
      now: NOW,
      participationsCount: 5,
    });
    expect(state.kind).toBe("open");
  });

  it("full_waitlist → seat cap reached and waitlist enabled", () => {
    const state = deriveRegistrationState({
      product: product({
        seat_count: 10,
        waitlist_enabled: true,
      }),
      now: NOW,
      participationsCount: 10,
    });
    expect(state.kind).toBe("full_waitlist");
    if (state.kind === "full_waitlist") {
      expect(state.seatCount).toBe(10);
    }
  });

  it("full_closed → seat cap reached and no waitlist", () => {
    const state = deriveRegistrationState({
      product: product({
        seat_count: 10,
        waitlist_enabled: false,
      }),
      now: NOW,
      participationsCount: 10,
    });
    expect(state.kind).toBe("full_closed");
    if (state.kind === "full_closed") {
      expect(state.seatCount).toBe(10);
    }
  });

  it("open → no cap, no threshold, just available", () => {
    const state = deriveRegistrationState({
      product: product({
        seat_count: null,
        waitlist_enabled: false,
      }),
      now: NOW,
      participationsCount: 0,
    });
    expect(state.kind).toBe("open");
    if (state.kind === "open") {
      expect(state.seatCount).toBeNull();
      expect(state.seatsLeft).toBeNull();
      expect(state.waitlistEnabled).toBe(false);
    }
  });

  it("open → with cap reports seatsLeft", () => {
    const state = deriveRegistrationState({
      product: product({
        seat_count: 10,
      }),
      now: NOW,
      participationsCount: 3,
    });
    expect(state.kind).toBe("open");
    if (state.kind === "open") {
      expect(state.seatCount).toBe(10);
      expect(state.seatsLeft).toBe(7);
    }
  });

  it("open → no cap with waitlist enabled (uncommon but legal)", () => {
    const state = deriveRegistrationState({
      product: product({
        seat_count: null,
        waitlist_enabled: true,
      }),
      now: NOW,
      participationsCount: 0,
    });
    expect(state.kind).toBe("open");
    if (state.kind === "open") {
      expect(state.waitlistEnabled).toBe(true);
    }
  });

  it("ended takes precedence over running_late (a finished camp is just ended)", () => {
    const state = deriveRegistrationState({
      product: product({
        product_type: "camp",
        status: "running",
        start_date: "2026-01-01",
        end_date: "2026-02-01",
      }),
      now: NOW,
      participationsCount: 0,
    });
    expect(state.kind).toBe("ended");
  });

  it("today, with no participations data, pending_thr still fires for threshold-only products", () => {
    // Default participationsCount = 0 → 0 < threshold → pending_thr. The
    // pill component drops the N/M caption when count is 0.
    const state = deriveRegistrationState({
      product: product({
        status: "pending",
        signup_threshold: 8,
        start_date: "2026-06-01",
        end_date: "2026-08-30",
      }),
      now: NOW,
      participationsCount: 0,
    });
    expect(state.kind).toBe("pending_thr");
    if (state.kind === "pending_thr") {
      expect(state.count).toBe(0);
      expect(state.threshold).toBe(8);
    }
  });
});
