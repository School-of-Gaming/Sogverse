import { describe, it, expect } from "vitest";
import {
  deriveRegistrationState,
  registrationCtaKind,
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
    schedule_slots: [],
    ...over,
  };
}

const NOW = new Date("2026-04-29T12:00:00Z");

// A single 18:00–20:00 Helsinki slot on 2026-04-29 (a Wednesday, weekday 2 in
// the 0=Mon schema — the deriver doesn't read weekday, but the fixture stays
// truthful). Helsinki is UTC+3 in April, so the event runs
// 15:00Z → 17:00Z and its end instant is 2026-04-29T17:00:00Z. Every `now`
// below is written as an explicit UTC instant so the assertions don't depend
// on the machine's zone.
const EVENT_DATE = "2026-04-29";
const EVENT_SLOT = [
  { weekday: 2, start_time: "18:00:00", duration_minutes: 120 },
];

function event(over: Partial<RegistrationStateInputs> = {}) {
  return product({
    product_type: "event",
    status: "running",
    start_date: EVENT_DATE,
    end_date: EVENT_DATE,
    schedule_slots: EVENT_SLOT,
    ...over,
  });
}

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
    expect(state).toEqual({ kind: "running_late", phase: "underway" });
  });

  it("event stays open on its own day before the session starts", () => {
    // 09:00Z = 12:00 Helsinki, six hours before the 18:00 doors. The old
    // date-only lock closed this at local midnight.
    const state = deriveRegistrationState({
      product: event(),
      now: new Date("2026-04-29T09:00:00Z"),
      participationsCount: 0,
    });
    expect(state.kind).toBe("open");
  });

  it("event stays open while the session is running", () => {
    // 16:00Z = 19:00 Helsinki — one hour into an 18:00–20:00 event.
    const state = deriveRegistrationState({
      product: event(),
      now: new Date("2026-04-29T16:00:00Z"),
      participationsCount: 0,
    });
    expect(state.kind).toBe("open");
  });

  it("a full event during its window is full_closed, not open", () => {
    const state = deriveRegistrationState({
      product: event({ seat_count: 10, waitlist_enabled: false }),
      now: new Date("2026-04-29T16:00:00Z"),
      participationsCount: 10,
    });
    expect(state.kind).toBe("full_closed");
  });

  it("a full event during its window offers the waitlist when enabled", () => {
    const state = deriveRegistrationState({
      product: event({ seat_count: 10, waitlist_enabled: true }),
      now: new Date("2026-04-29T16:00:00Z"),
      participationsCount: 10,
    });
    expect(state.kind).toBe("full_waitlist");
  });

  it("event locks at exactly its end instant", () => {
    // 18:00 Helsinki + 120 min = 20:00 Helsinki = 17:00Z. The boundary is
    // inclusive: at the end instant the event is over.
    const state = deriveRegistrationState({
      product: event(),
      now: new Date("2026-04-29T17:00:00Z"),
      participationsCount: 0,
    });
    expect(state).toEqual({ kind: "running_late", phase: "over" });
  });

  it("event is a dead end after it ends, still on its own day", () => {
    // 20:00Z = 23:00 Helsinki — the event is over but end_date hasn't passed
    // locally, so effectiveStatus is still `running` (not `completed`).
    const state = deriveRegistrationState({
      product: event(),
      now: new Date("2026-04-29T20:00:00Z"),
      participationsCount: 0,
    });
    expect(state).toEqual({ kind: "running_late", phase: "over" });
  });

  it("event with no schedule slot falls back to the midnight lock", () => {
    // Schema-impossible (the admin form requires a slot) but type-possible:
    // with nothing to time against, the camp rule applies — locked from
    // local midnight on start_date.
    const state = deriveRegistrationState({
      product: event({ schedule_slots: [] }),
      now: new Date("2026-04-29T09:00:00Z"),
      participationsCount: 0,
    });
    expect(state).toEqual({ kind: "running_late", phase: "underway" });
  });

  it("camps ignore schedule slots — locked from midnight on start_date", () => {
    // Same 18:00 slot, same "before doors" instant as the open-event case
    // above; a camp is a cohort that starts together, so it stays locked.
    const state = deriveRegistrationState({
      product: product({
        product_type: "camp",
        status: "running",
        start_date: EVENT_DATE,
        end_date: "2026-05-03",
        schedule_slots: EVENT_SLOT,
      }),
      now: new Date("2026-04-29T09:00:00Z"),
      participationsCount: 0,
    });
    expect(state).toEqual({ kind: "running_late", phase: "underway" });
  });

  it("an event whose slot crosses local midnight closes at midnight, not at its end instant", () => {
    // 23:00 Helsinki + 180 min ends at 02:00 the NEXT local day, but
    // `effectiveStatus` compares end_date date-only, so the row is already
    // `completed` by then and the CTA is `ended` — the end-instant window is
    // clipped at midnight. The server-side gate stops at the same moment, so
    // both ends agree. Pinned here because the doc claims it.
    const lateNightSlot = [
      { weekday: 2, start_time: "23:00:00", duration_minutes: 180 },
    ];
    const lateNight = event({ schedule_slots: lateNightSlot });
    // 21:00Z = 00:00 Helsinki on 04-30 — one hour into the session, two hours
    // before its end instant.
    const state = deriveRegistrationState({
      product: lateNight,
      now: new Date("2026-04-29T21:00:00Z"),
      participationsCount: 0,
    });
    expect(state.kind).toBe("ended");
  });

  it("an event whose end_date has passed is ended, not running_late", () => {
    const state = deriveRegistrationState({
      product: event(),
      now: new Date("2026-04-30T09:00:00Z"),
      participationsCount: 0,
    });
    expect(state.kind).toBe("ended");
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

  it("full_waitlist → overfull counts as full, with no negative seats to leak", () => {
    // A soft cap on a paid product can be exceeded: the gate refuses new
    // entrants at the cap, but anyone already inside a Stripe Checkout session
    // completes and gets their seat. The state has to read as full rather than
    // as "-2 seats", and there is deliberately no `seatsLeft` on this kind for
    // a negative to hide in — the family-facing bar is handed a flat 0.
    const state = deriveRegistrationState({
      product: product({ seat_count: 20, waitlist_enabled: true }),
      now: NOW,
      participationsCount: 22,
    });
    expect(state.kind).toBe("full_waitlist");
    if (state.kind === "full_waitlist") {
      expect(state.seatCount).toBe(20);
    }
  });

  it("full_closed → overfull with no waitlist is still a dead end", () => {
    const state = deriveRegistrationState({
      product: product({ seat_count: 20, waitlist_enabled: false }),
      now: NOW,
      participationsCount: 25,
    });
    expect(state.kind).toBe("full_closed");
    expect(registrationCtaKind(state)).toBe("disabled");
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

describe("registrationCtaKind", () => {
  it("running_late → disabled, whichever phase (started camp / finished event)", () => {
    expect(
      registrationCtaKind({ kind: "running_late", phase: "underway" }),
    ).toBe("disabled");
    expect(registrationCtaKind({ kind: "running_late", phase: "over" })).toBe(
      "disabled",
    );
  });

  it("full_closed → disabled (full with no waitlist is a dead end too)", () => {
    expect(registrationCtaKind({ kind: "full_closed", seatCount: 15 })).toBe(
      "disabled",
    );
  });

  it("ended → no button at all", () => {
    expect(registrationCtaKind({ kind: "ended" })).toBeNull();
  });

  it("open → primary View button", () => {
    expect(
      registrationCtaKind({
        kind: "open",
        seatCount: null,
        seatsLeft: null,
        waitlistEnabled: false,
      }),
    ).toBe("primary");
  });
});
