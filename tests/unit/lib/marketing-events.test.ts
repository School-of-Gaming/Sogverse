import { describe, expect, it } from "vitest";
import { isAdvertisedProduct, isValidPixelId } from "@/lib/marketing-events";
import { Constants } from "@/types";
import type { BillingMode, ProductType } from "@/types";

/**
 * `isAdvertisedProduct` is the only thing standing between a council-arranged
 * club — or a product settled by contract off-platform — and a conversion
 * report to an advertising platform. A wrong `true` here does not fail: it
 * reports a signup nobody was advertised into, and the campaign is optimised
 * against the noise.
 *
 * So the cases below are written as a closed truth table rather than a sample.
 * Both enums are read from the generated `Constants`, and the advertised halves
 * are pinned against literal lists, which is what makes a *new* enum member a
 * decision somebody has to make: add one and these tests fail, rather than the
 * new kind quietly being advertised because the function's two `if`s did not
 * happen to name it.
 */

const PRODUCT_TYPES = Constants.public.Enums.product_type;
const BILLING_MODES = Constants.public.Enums.billing_mode;

/** The pair the function actually takes — spelled once, used everywhere below. */
function product(
  product_type: ProductType,
  billing_mode: BillingMode,
): { product_type: ProductType; billing_mode: BillingMode } {
  return { product_type, billing_mode };
}

describe("isAdvertisedProduct", () => {
  it("advertises an ordinary paid consumer club", () => {
    expect(isAdvertisedProduct(product("consumer_club", "paid"))).toBe(true);
  });

  it("refuses a municipality club, whatever it is billed as", () => {
    // Its families arrive through their school, so there is no ad to credit —
    // including on the `paid` mode a municipality club would not normally
    // carry, because the product type alone has to be enough.
    for (const mode of BILLING_MODES) {
      expect(isAdvertisedProduct(product("municipality_club", mode))).toBe(
        false,
      );
    }
  });

  it("refuses a product invoiced off-platform, whatever type it is", () => {
    for (const type of PRODUCT_TYPES) {
      expect(isAdvertisedProduct(product(type, "external_contract"))).toBe(
        false,
      );
    }
  });

  it("refuses a product carrying both exclusions", () => {
    // The overlapping case: a municipality club billed by contract is the
    // ordinary real-world shape, and neither guard may be written in a way
    // that lets the other one's absence rescue it.
    expect(
      isAdvertisedProduct(product("municipality_club", "external_contract")),
    ).toBe(false);
  });

  it("advertises every other type on every other billing mode", () => {
    const advertised = PRODUCT_TYPES.flatMap((type) =>
      BILLING_MODES.map((mode) => ({ type, mode })),
    ).filter(({ type, mode }) => isAdvertisedProduct(product(type, mode)));

    // The whole cartesian product minus the two excluded halves — asserted as
    // a set rather than case by case, so nothing in the table is unaccounted
    // for. A free camp is advertised: "free" is a price, not an absence of
    // marketing, and only `external_contract` means settled elsewhere.
    expect(advertised).toEqual([
      { type: "consumer_club", mode: "paid" },
      { type: "consumer_club", mode: "free" },
      { type: "camp", mode: "paid" },
      { type: "camp", mode: "free" },
      { type: "event", mode: "paid" },
      { type: "event", mode: "free" },
    ]);
  });

  it("names every product type it advertises", () => {
    // Pinned against a literal, not derived: a product type added to the enum
    // lands outside this list and fails here, which is the point. Whether a new
    // kind of product is one we advertise is a decision, and the default a
    // silent pass would hand it is the expensive one.
    const advertisedTypes = PRODUCT_TYPES.filter((type) =>
      isAdvertisedProduct(product(type, "paid")),
    );
    expect(advertisedTypes).toEqual(["consumer_club", "camp", "event"]);
  });

  it("names every billing mode it advertises", () => {
    // The same ratchet on the other axis: a fourth billing mode is a decision.
    const advertisedModes = BILLING_MODES.filter((mode) =>
      isAdvertisedProduct(product("consumer_club", mode)),
    );
    expect(advertisedModes).toEqual(["paid", "free"]);
  });
});

/**
 * The pixel id check. Its job is to read an *absent* or placeholder value as
 * "the pixel is off" — which is what every environment but production gets —
 * rather than as an id that will be rejected on every event.
 */
describe("isValidPixelId", () => {
  it("accepts a run of digits", () => {
    expect(isValidPixelId("1234567890")).toBe(true);
    expect(isValidPixelId("0")).toBe(true);
    expect(isValidPixelId("1".repeat(32))).toBe(true);
  });

  it("reads an unset variable as off", () => {
    expect(isValidPixelId(undefined)).toBe(false);
    expect(isValidPixelId("")).toBe(false);
  });

  it("reads a placeholder as off rather than as an id", () => {
    expect(isValidPixelId("your-meta-pixel-id")).toBe(false);
    expect(isValidPixelId("changeme")).toBe(false);
  });

  it("refuses digits with anything else attached", () => {
    // Whitespace is the one that would otherwise survive a hand-rolled check:
    // a trailing newline off a copied-and-pasted env value, or the spaces a
    // dashboard puts either side of the number.
    expect(isValidPixelId(" 1234567890")).toBe(false);
    expect(isValidPixelId("1234567890 ")).toBe(false);
    expect(isValidPixelId("1234567890\n")).toBe(false);
    expect(isValidPixelId("123-456")).toBe(false);
    expect(isValidPixelId("1e9")).toBe(false);
    expect(isValidPixelId("1".repeat(33))).toBe(false);
  });

  it("refuses digits that are not the ASCII ones", () => {
    // Arabic-indic and fullwidth digits read as numbers to a person and are
    // not what the advertiser id is; the check is ASCII-only on purpose.
    expect(isValidPixelId("١٢٣")).toBe(false);
    expect(isValidPixelId("１２３")).toBe(false);
  });

  it("narrows the value for its caller", () => {
    const configured: string | undefined = "1234567890";
    if (!isValidPixelId(configured)) throw new Error("expected a valid id");
    // The guard's return type is what lets a caller pass the value on where a
    // `string` is required; this line would not compile without it.
    const asString: string = configured;
    expect(asString).toBe("1234567890");
  });
});
