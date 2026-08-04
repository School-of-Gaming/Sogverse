import { describe, it, expect } from "vitest";
import { formLocksFor } from "@/components/admin/products/form-locks";
import {
  initialState,
  withPaidMode,
} from "@/components/admin/products/product-form-state";
import {
  PRODUCT_TYPE_CONFIG,
  type PaidMode,
  type ProductTypeConfig,
} from "@/components/admin/products/product-type-config";

// `formLocksFor` decides, in one place, which pre-prod controls the admin
// product form leaves editable. It is a pure function of (type config, free/paid
// form state), and the billing half is the interesting one: an event's free/paid
// radio is live form state, so the seat and waitlist locks move underneath the
// admin mid-form. These tests pin the whole matrix, the initialState defaults
// that pair with it, and the free→paid transition that has to clear a cap it is
// about to lock away.

const consumerConfig = PRODUCT_TYPE_CONFIG.consumer_club;
const muniConfig = PRODUCT_TYPE_CONFIG.municipality_club;
const campConfig = PRODUCT_TYPE_CONFIG.camp;
const eventConfig = PRODUCT_TYPE_CONFIG.event;

/** Every (config, paid mode) pair the resolver can be asked about — used by
 *  the sweeps that assert a lock never lifts. Types that pin their billing
 *  mode ignore the second element, so one entry each is enough. */
const EVERY_CASE: ReadonlyArray<[ProductTypeConfig, PaidMode]> = [
  [consumerConfig, "paid"],
  [muniConfig, "paid"],
  [campConfig, "paid"],
  [eventConfig, "free"],
  [eventConfig, "paid"],
];

describe("formLocksFor", () => {
  describe("municipality clubs", () => {
    it("unlocks seats, waitlist and the registration window", () => {
      const locks = formLocksFor(muniConfig, "paid");
      expect(locks.seatCount).toBe(false);
      expect(locks.waitlist).toBe(false);
      expect(locks.registrationTiming).toBe(false);
    });

    it("ignores the paid mode — a muni club is always off-platform", () => {
      // Guards against a future edit that gates the muni branch on the mode
      // and silently re-locks the one type these features shipped for.
      for (const mode of ["paid", "free"] as const) {
        expect(formLocksFor(muniConfig, mode).seatCount).toBe(false);
      }
    });
  });

  describe("events", () => {
    it("unlocks seats and the waitlist while free", () => {
      const locks = formLocksFor(eventConfig, "free");
      expect(locks.seatCount).toBe(false);
      expect(locks.waitlist).toBe(false);
    });

    it("locks seats and the waitlist once paid", () => {
      // A paid signup validates the cap and then leaves for Stripe Checkout
      // with nothing held, so two parents can both take the last seat.
      const locks = formLocksFor(eventConfig, "paid");
      expect(locks.seatCount).toBe(true);
      expect(locks.waitlist).toBe(true);
    });

    it("unlocks the registration window regardless of billing mode", () => {
      // The scheduled ticket drop only writes registration_opens_at, which the
      // parent-facing state machine already honours with a pre-open countdown.
      expect(formLocksFor(eventConfig, "free").registrationTiming).toBe(false);
      expect(formLocksFor(eventConfig, "paid").registrationTiming).toBe(false);
    });

    it("does not treat the type's default billing mode as the live one", () => {
      // An event's config declares defaultBillingMode "free". The resolver takes
      // the *form's* free/paid state, so a paid event stays locked no matter
      // what the type defaults to — the whole reason the effective mode is
      // resolved inside the resolver rather than handed to it.
      expect(eventConfig.defaultBillingMode).toBe("free");
      expect(formLocksFor(eventConfig, "paid").seatCount).toBe(true);
    });
  });

  describe("consumer clubs and camps", () => {
    it("keeps the whole pre-prod set locked", () => {
      for (const config of [consumerConfig, campConfig]) {
        const locks = formLocksFor(config, "paid");
        expect(locks.seatCount).toBe(true);
        expect(locks.waitlist).toBe(true);
        expect(locks.registrationTiming).toBe(true);
      }
    });
  });

  describe("the When-section locks", () => {
    it("stays on for every type and billing mode", () => {
      // No product lifts these today; the When section resolves them through
      // this function anyway so there is only ever one decision-maker.
      for (const [config, mode] of EVERY_CASE) {
        const locks = formLocksFor(config, mode);
        expect(locks.startMode).toBe(true);
        expect(locks.consumerClubStartDateToday).toBe(true);
        expect(locks.holidayCalendars).toBe(true);
      }
    });
  });

  describe("the waitlist rides with the seat cap", () => {
    it("is unlocked in exactly the cases a cap is", () => {
      for (const [config, mode] of EVERY_CASE) {
        const locks = formLocksFor(config, mode);
        expect(locks.waitlist).toBe(locks.seatCount);
      }
    });
  });
});

describe("initialState capacity defaults", () => {
  it("starts an event uncapped, with its seat controls already unlocked", () => {
    // An event defaults to free, so the admin can reach the cap from the very
    // first render — but a cap is opt-in, not the default.
    const s = initialState(eventConfig, "en");
    expect(s.paidMode).toBe("free");
    expect(s.uncapped).toBe(true);
    expect(s.waitlistEnabled).toBe(false);
    expect(s.seatCount).toBe("");
  });

  it("starts a municipality club capped and waitlisted", () => {
    // A muni club is contracted for a specific number of places; the blank
    // seat count is what forces the admin to type the contracted figure.
    const s = initialState(muniConfig, "en");
    expect(s.uncapped).toBe(false);
    expect(s.waitlistEnabled).toBe(true);
    expect(s.seatCount).toBe("");
  });

  it("pins the safe default where seats are still locked", () => {
    for (const config of [consumerConfig, campConfig]) {
      const s = initialState(config, "en");
      expect(s.uncapped).toBe(true);
      expect(s.waitlistEnabled).toBe(false);
    }
  });
});

describe("withPaidMode", () => {
  it("clears a cap when an event switches from free to paid", () => {
    const free = initialState(eventConfig, "en");
    const capped = {
      ...free,
      uncapped: false,
      seatCount: "25",
      waitlistEnabled: true,
    };

    const paid = withPaidMode(capped, eventConfig, "paid");

    expect(paid.paidMode).toBe("paid");
    expect(paid.uncapped).toBe(true);
    expect(paid.seatCount).toBe("");
    expect(paid.waitlistEnabled).toBe(false);
  });

  it("leaves the cap alone when switching back to free", () => {
    // Free unlocks the controls, so there is nothing to strand.
    const capped = {
      ...initialState(eventConfig, "en"),
      paidMode: "paid" as const,
      uncapped: false,
      seatCount: "25",
      waitlistEnabled: true,
    };

    const free = withPaidMode(capped, eventConfig, "free");

    expect(free.paidMode).toBe("free");
    expect(free.uncapped).toBe(false);
    expect(free.seatCount).toBe("25");
    expect(free.waitlistEnabled).toBe(true);
  });

  it("changes nothing but the mode when the target is already uncapped", () => {
    const free = initialState(eventConfig, "en");
    expect(withPaidMode(free, eventConfig, "paid")).toEqual({
      ...free,
      paidMode: "paid",
    });
  });
});
