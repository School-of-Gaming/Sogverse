import { describe, it, expect } from "vitest";
import { formLocksFor } from "@/components/admin/products/form-locks";
import {
  initialState,
  withSeatLimitMode,
} from "@/components/admin/products/product-form-state";
import {
  PRODUCT_TYPE_CONFIG,
  type ProductTypeConfig,
} from "@/components/admin/products/product-type-config";

// `formLocksFor` decides, in one place, which pre-prod controls the admin
// product form leaves editable. It is a pure function of the type config: seats
// and the waitlist are signed off for municipality clubs alone, and events add
// only the registration window. (Seats/waitlist were briefly unlocked for *free*
// events too, which made the resolver depend on live free/paid form state; that
// unlock is reverted until the shop can render a full event — see TODO.md — and
// these tests pin the re-locked matrix so it cannot drift back by accident.)
//
// Alongside it, `withSeatLimitMode` is the seat-limit radio's handler, and it
// carries the rule a hidden control needs: choosing Unlimited must clear the
// waitlist flag the checkbox set, because the build submits that flag whether or
// not the checkbox is on screen.

const consumerConfig = PRODUCT_TYPE_CONFIG.consumer_club;
const muniConfig = PRODUCT_TYPE_CONFIG.municipality_club;
const campConfig = PRODUCT_TYPE_CONFIG.camp;
const eventConfig = PRODUCT_TYPE_CONFIG.event;

/** Every config the resolver can be asked about — used by the sweeps that
 *  assert a lock never lifts. */
const EVERY_CONFIG: readonly ProductTypeConfig[] = [
  consumerConfig,
  muniConfig,
  campConfig,
  eventConfig,
];

describe("formLocksFor", () => {
  describe("municipality clubs", () => {
    it("unlocks seats, waitlist and the registration window", () => {
      const locks = formLocksFor(muniConfig);
      expect(locks.seatCount).toBe(false);
      expect(locks.waitlist).toBe(false);
      expect(locks.registrationTiming).toBe(false);
    });

    it("is the only type that unlocks a seat cap", () => {
      // The capacity gate can only be trusted where signup never reaches
      // Checkout, and muni clubs are invoiced off-platform.
      for (const config of EVERY_CONFIG) {
        const unlocked = !formLocksFor(config).seatCount;
        expect(unlocked).toBe(config === muniConfig);
      }
    });
  });

  describe("events", () => {
    it("unlocks the registration window", () => {
      // The scheduled ticket drop only writes registration_opens_at, which the
      // parent-facing state machine already honours with a pre-open countdown.
      expect(formLocksFor(eventConfig).registrationTiming).toBe(false);
    });

    it("keeps seats and the waitlist locked", () => {
      // Re-locked deliberately: the parent-facing shop cannot yet tell a full
      // capped event from an open one, so a cap would publish a page with no way
      // to say it is full. TODO.md holds the conditions for lifting it.
      const locks = formLocksFor(eventConfig);
      expect(locks.seatCount).toBe(true);
      expect(locks.waitlist).toBe(true);
    });
  });

  describe("consumer clubs and camps", () => {
    it("keeps the whole pre-prod set locked", () => {
      for (const config of [consumerConfig, campConfig]) {
        const locks = formLocksFor(config);
        expect(locks.seatCount).toBe(true);
        expect(locks.waitlist).toBe(true);
        expect(locks.registrationTiming).toBe(true);
      }
    });
  });

  describe("the When-section locks", () => {
    it("stays on for every type", () => {
      // No product lifts these today; the When section resolves them through
      // this function anyway so there is only ever one decision-maker.
      for (const config of EVERY_CONFIG) {
        const locks = formLocksFor(config);
        expect(locks.startMode).toBe(true);
        expect(locks.consumerClubStartDateToday).toBe(true);
        expect(locks.holidayCalendars).toBe(true);
      }
    });
  });

  describe("the waitlist rides with the seat cap", () => {
    it("is unlocked in exactly the cases a cap is", () => {
      for (const config of EVERY_CONFIG) {
        const locks = formLocksFor(config);
        expect(locks.waitlist).toBe(locks.seatCount);
      }
    });
  });
});

describe("initialState capacity defaults", () => {
  it("starts a municipality club capped and waitlisted", () => {
    // A muni club is contracted for a specific number of places; the blank
    // seat count is what forces the admin to type the contracted figure.
    const s = initialState(muniConfig, "en");
    expect(s.uncapped).toBe(false);
    expect(s.waitlistEnabled).toBe(true);
    expect(s.seatCount).toBe("");
  });

  it("pins the safe default everywhere seats are locked", () => {
    // Including events: a capped default behind a locked, blank seat count is a
    // form validate() would refuse with no way for the admin to fix it.
    for (const config of [consumerConfig, campConfig, eventConfig]) {
      const s = initialState(config, "en");
      expect(s.uncapped).toBe(true);
      expect(s.waitlistEnabled).toBe(false);
      expect(s.seatCount).toBe("");
    }
  });

  it("still starts an event free", () => {
    // The free/paid radio no longer moves any lock, but it is still the form's
    // billing choice and free is still where an event begins.
    expect(initialState(eventConfig, "en").paidMode).toBe("free");
  });
});

describe("withSeatLimitMode", () => {
  it("clears the waitlist when the cap is removed", () => {
    // The checkbox only renders behind a cap, but the build submits
    // `waitlist_enabled` unconditionally — so without this a "cap it, tick the
    // waitlist, change your mind" pass saved a waitlisted, uncapped product.
    const capped = {
      ...initialState(muniConfig, "en"),
      uncapped: false,
      seatCount: "25",
      waitlistEnabled: true,
    };

    const unlimited = withSeatLimitMode(capped, "unlimited");

    expect(unlimited.uncapped).toBe(true);
    expect(unlimited.waitlistEnabled).toBe(false);
  });

  it("keeps the typed seat count so toggling back restores it", () => {
    // The seat count is inert while uncapped (the build reads null), so there is
    // nothing to clear — and the admin can see it, unlike the checkbox.
    const capped = {
      ...initialState(muniConfig, "en"),
      uncapped: false,
      seatCount: "25",
      waitlistEnabled: true,
    };

    const roundTrip = withSeatLimitMode(
      withSeatLimitMode(capped, "unlimited"),
      "limited",
    );

    expect(roundTrip.uncapped).toBe(false);
    expect(roundTrip.seatCount).toBe("25");
  });

  it("leaves an existing waitlist choice alone when picking Limited", () => {
    const uncapped = {
      ...initialState(muniConfig, "en"),
      uncapped: true,
      waitlistEnabled: true,
    };

    expect(withSeatLimitMode(uncapped, "limited")).toEqual({
      ...uncapped,
      uncapped: false,
    });
  });
});
