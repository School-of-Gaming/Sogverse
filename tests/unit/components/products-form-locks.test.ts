import { describe, it, expect } from "vitest";
import { formLocksFor } from "@/components/admin/products/form-locks";
import {
  capacityDefaultsToCapped,
  initialState,
  offersUncapped,
  withPaidMode,
} from "@/components/admin/products/product-form-state";
import {
  PRODUCT_TYPE_CONFIG,
  type ProductTypeConfig,
} from "@/components/admin/products/product-type-config";

// `formLocksFor` decides, in one place, which pre-prod controls the admin
// product form leaves editable. It is a pure function of the type config, and
// the registration window is the only thing left that lifts per type
// (municipality clubs alone). Seats and the waitlist used to sit here too and no
// longer do: caps and waitlists are available on every type, with the *semantics*
// keyed to the money rather than the control being keyed to the type.
//
// The capacity rules that replaced those locks are pinned below — who may run
// uncapped, who starts capped, and what a mid-form billing flip does. The
// capacity *payload* rules (an uncapped product never submitting a waitlist, a
// stored capped row surviving a re-save) live with the builder they belong to,
// in products-build.test.ts.

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
  describe("the registration window", () => {
    it("is unlocked for municipality clubs alone", () => {
      // Every consumer-facing shape (club, camp, event) opens for signup right
      // away; the scheduled drop exists for the one type that is contracted and
      // invoiced off-platform. Events briefly had it editable — that put a
      // second, easily-confused date question on every event form.
      for (const config of EVERY_CONFIG) {
        const unlocked = !formLocksFor(config).registrationTiming;
        expect(unlocked).toBe(config === muniConfig);
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
        expect(locks.holidayCalendars).toBe(true);
      }
    });

    it("no longer carries a consumer-club start-date lock at all", () => {
      // The lock was retired, not flipped off: a consumer club's first charge is
      // deferred to its start date now, so there is nothing left for the flag to
      // protect. Asserted as *absence* rather than as `false`, because a flag
      // left sitting there reading false is an invitation to switch it back on.
      for (const config of EVERY_CONFIG) {
        expect(formLocksFor(config)).not.toHaveProperty(
          "consumerClubStartDateToday",
        );
      }
    });
  });
});

describe("offersUncapped", () => {
  it("withholds the no-limit option from municipality clubs alone", () => {
    // A muni club is contracted for a specific number of places, so "no seat
    // limit" is not an answer it may give. Every other type may run open.
    for (const config of EVERY_CONFIG) {
      expect(offersUncapped(config)).toBe(config !== muniConfig);
    }
  });
});

describe("capacityDefaultsToCapped", () => {
  it("caps a municipality club whatever the billing pick says", () => {
    expect(capacityDefaultsToCapped(muniConfig, "paid")).toBe(true);
    expect(capacityDefaultsToCapped(muniConfig, "free")).toBe(true);
  });

  it("caps every no-charge product, so 'forgot to cap' cannot happen", () => {
    // A free signup writes its seat under the product lock, so the cap is hard
    // and costs nothing to hold. The admin still has to decide — the number is
    // blank and required — but the decision is made rather than defaulted past.
    expect(capacityDefaultsToCapped(eventConfig, "free")).toBe(true);
    expect(capacityDefaultsToCapped(consumerConfig, "free")).toBe(true);
  });

  it("leaves every paid product open", () => {
    // A cap on a paid product is soft (the seat arrives with the payment), so
    // it is opt-in rather than something to opt out of.
    expect(capacityDefaultsToCapped(consumerConfig, "paid")).toBe(false);
    expect(capacityDefaultsToCapped(campConfig, "paid")).toBe(false);
    expect(capacityDefaultsToCapped(eventConfig, "paid")).toBe(false);
  });
});

describe("withPaidMode", () => {
  it("caps an uncapped form when the admin picks free", () => {
    const paidClub = initialState(consumerConfig, "en");
    expect(paidClub.uncapped).toBe(true);

    const free = withPaidMode(paidClub, "free");

    expect(free.paidMode).toBe("free");
    expect(free.uncapped).toBe(false);
    expect(free.waitlistEnabled).toBe(true); // the free default
    expect(free.seatCount).toBe(""); // nothing invented
  });

  it("keeps a seat count the admin already typed", () => {
    // The rule exists to stop a forgotten cap, never to discard a chosen one —
    // on the edit form this is a stored capped paid product being flipped free.
    const capped = {
      ...initialState(campConfig, "en"),
      uncapped: false,
      seatCount: "24",
      waitlistEnabled: false,
    };

    const free = withPaidMode(capped, "free");

    expect(free.seatCount).toBe("24");
    expect(free.uncapped).toBe(false);
    // Already capped, so the rule does not fire and the admin's untick stands.
    expect(free.waitlistEnabled).toBe(false);
  });

  it("leaves capacity entirely alone when the admin picks paid", () => {
    // Caps and waitlists are legal on both sides of the billing line, so a flip
    // to paid has nothing to clear — and blanking a typed number would be the
    // one thing the rule promises never to do.
    const freeCapped = {
      ...initialState(eventConfig, "en"),
      seatCount: "30",
      waitlistEnabled: true,
    };

    const paid = withPaidMode(freeCapped, "paid");

    expect(paid.paidMode).toBe("paid");
    expect(paid.uncapped).toBe(false);
    expect(paid.seatCount).toBe("30");
    expect(paid.waitlistEnabled).toBe(true);
  });

  it("leaves an uncapped form uncapped when the admin picks paid", () => {
    const uncappedFree = { ...initialState(eventConfig, "en"), uncapped: true };

    const paid = withPaidMode(uncappedFree, "paid");

    expect(paid.uncapped).toBe(true);
    expect(paid.waitlistEnabled).toBe(true); // untouched; the build derives it away
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

  it("starts a free event capped, waitlisted and blank", () => {
    const s = initialState(eventConfig, "en");
    expect(s.paidMode).toBe("free");
    expect(s.uncapped).toBe(false);
    expect(s.waitlistEnabled).toBe(true);
    expect(s.seatCount).toBe("");
  });

  it("starts the paid types uncapped", () => {
    for (const config of [consumerConfig, campConfig]) {
      const s = initialState(config, "en");
      expect(s.paidMode).toBe("paid");
      expect(s.uncapped).toBe(true);
      expect(s.waitlistEnabled).toBe(false);
      expect(s.seatCount).toBe("");
    }
  });

  it("starts every type with an empty start date", () => {
    // Consumer clubs used to open pinned to today, because billing could not
    // wait. It can now, so a fresh form asks the admin for the date like every
    // other type does, and `startDateRequired` is what makes them answer.
    for (const config of EVERY_CONFIG) {
      expect(initialState(config, "en").startDate, config.productType).toBe("");
    }
  });

  it("starts a consumer club paid, not free", () => {
    // Clubs gained the free/paid chooser events already had; paid is still
    // where a club begins, so the unlock adds an option without moving anyone.
    expect(initialState(consumerConfig, "en").paidMode).toBe("paid");
  });
});
