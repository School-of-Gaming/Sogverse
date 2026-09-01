import { describe, expect, it } from "vitest";
import {
  NO_CHARGE_BILLING_MODES,
  isNoChargeBillingMode,
} from "@/lib/constants/billing";
import { Constants } from "@/types";

/**
 * The no-charge billing modes — the named set behind the colloquial "free",
 * which almost always means both a genuinely free product AND a municipality
 * club invoiced off-platform.
 *
 * The set is a hand-picked *subset* of the enum, so unlike the spoken-language
 * list it cannot be derived from `Constants` outright. What can be checked is
 * that every member is a real enum member and that the leftover is exactly the
 * one paying mode — which is what turns the `satisfies` on the constant from a
 * type-level opinion into something a rename would break twice over.
 */
describe("NO_CHARGE_BILLING_MODES", () => {
  const declared = Constants.public.Enums.billing_mode;

  it("names only modes the generated enum declares", () => {
    for (const mode of NO_CHARGE_BILLING_MODES) {
      expect(declared).toContain(mode);
    }
  });

  it("leaves exactly one paying mode over", () => {
    // Not a restatement of the set: it pins the *complement*, so a third
    // no-charge mode added to the enum and forgotten here fails loudly rather
    // than silently being treated as paid.
    const paying = declared.filter(
      (mode) => !NO_CHARGE_BILLING_MODES.some((free) => free === mode),
    );
    expect(paying).toEqual(["paid"]);
  });
});

describe("isNoChargeBillingMode", () => {
  it("is true for a free product and for a municipality club", () => {
    expect(isNoChargeBillingMode("free")).toBe(true);
    expect(isNoChargeBillingMode("external_contract")).toBe(true);
  });

  it("is false for a paid product", () => {
    // The third and last member of the enum, so these two cases together are
    // the whole truth table rather than a sample of it.
    expect(isNoChargeBillingMode("paid")).toBe(false);
  });
});
