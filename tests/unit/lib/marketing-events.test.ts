import { describe, expect, it } from "vitest";
import {
  isAdvertisedProduct,
  isValidPixelId,
  isValidRedditPixelId,
  metaProductDetails,
  PIXEL_EVENTS,
  REDDIT_CONVERSION_EVENTS,
  REDDIT_PIXEL_EVENTS,
  redditProductDetails,
} from "@/lib/marketing-events";
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

/**
 * Which product an event is about, in Meta's own product fields. The browser's
 * product view and both server enrolment reports send exactly this object, so
 * what is pinned here is what every one of them says about a product.
 */
describe("metaProductDetails", () => {
  const ROBLOX_CLUB = {
    id: "8f0c1c55-6b0e-4a43-9d1a-2f4b8c7e9a10",
    topic: "roblox_studio" as const,
    billing_mode: "paid" as const,
    product_translations: [
      { locale: "fi", name: "Roblox Studio -kerho" },
      { locale: "en", name: "Roblox Studio Club" },
    ],
    product_prices: [{ currency: "eur", price_cents: 4900 }],
  };

  it("states the product's id, English name, topic and price", () => {
    expect(metaProductDetails(ROBLOX_CLUB)).toEqual({
      content_ids: [ROBLOX_CLUB.id],
      content_type: "product",
      content_name: "Roblox Studio Club",
      content_category: "roblox_studio",
      value: 49,
      currency: "EUR",
    });
  });

  // One product is one name in a report, whatever language it was bought in —
  // and a product never written in English still has a name rather than none.
  it("falls back to the first written name when there is no English one", () => {
    const noEnglish = {
      ...ROBLOX_CLUB,
      product_translations: [
        { locale: "sv", name: "Roblox Studio-klubb" },
        { locale: "fi", name: "Roblox Studio -kerho" },
      ],
    };
    expect(metaProductDetails(noEnglish).content_name).toBe(
      "Roblox Studio -kerho",
    );
  });

  it("values a free product at zero, whatever price rows it carries", () => {
    const details = metaProductDetails({
      ...ROBLOX_CLUB,
      billing_mode: "free",
      product_prices: [],
    });
    expect(details.value).toBe(0);
    expect(details.currency).toBe("EUR");
  });

  // A guessed price is worse than none: the platform would optimise towards it.
  it("states no value at all for a paid product with no price in the currency", () => {
    const details = metaProductDetails({ ...ROBLOX_CLUB, product_prices: [] });
    expect(details).not.toHaveProperty("value");
    expect(details).not.toHaveProperty("currency");
  });
});

/**
 * Reddit is told the same facts about a product as Meta, in its own shape. The
 * cases run every product through both builders and compare what they say,
 * so the two platforms cannot drift into describing one product two ways.
 */
describe("redditProductDetails", () => {
  const ROBLOX_CLUB = {
    id: "8f0c1c55-6b0e-4a43-9d1a-2f4b8c7e9a10",
    topic: "roblox_studio" as const,
    billing_mode: "paid" as const,
    product_translations: [
      { locale: "fi", name: "Roblox Studio -kerho" },
      { locale: "en", name: "Roblox Studio Club" },
    ],
    product_prices: [{ currency: "eur", price_cents: 4900 }],
  };

  it("states the product's id, English name, topic and price", () => {
    expect(redditProductDetails(ROBLOX_CLUB)).toEqual({
      products: [
        {
          id: ROBLOX_CLUB.id,
          name: "Roblox Studio Club",
          category: "roblox_studio",
        },
      ],
      itemCount: 1,
      value: 49,
      currency: "EUR",
    });
  });

  it.each([
    ["a priced club", ROBLOX_CLUB],
    ["a free product", { ...ROBLOX_CLUB, billing_mode: "free" as const, product_prices: [] }],
    ["a paid product with no price in the currency", { ...ROBLOX_CLUB, product_prices: [] }],
    [
      "a product never written in English",
      {
        ...ROBLOX_CLUB,
        product_translations: [{ locale: "sv", name: "Roblox Studio-klubb" }],
      },
    ],
  ])("says what Meta is told about %s", (_label, product) => {
    const meta = metaProductDetails(product);
    const reddit = redditProductDetails(product);

    expect(reddit.products).toEqual([
      {
        id: meta.content_ids[0],
        name: meta.content_name,
        category: meta.content_category,
      },
    ]);
    expect(reddit.value).toBe(meta.value);
    expect(reddit.currency).toBe(meta.currency);
    expect("value" in reddit).toBe("value" in meta);
    expect("currency" in reddit).toBe("currency" in meta);
  });
});

/**
 * Reddit gets every event Meta has, and the pairing is a decision: each
 * Reddit name is the closest standard event to the moment Meta's describes.
 */
describe("the Reddit vocabulary", () => {
  it("names the three browser events, beside Meta's", () => {
    expect({
      pageView: [PIXEL_EVENTS.pageView, REDDIT_PIXEL_EVENTS.pageView],
      productView: [PIXEL_EVENTS.productView, REDDIT_PIXEL_EVENTS.productView],
      checkout: [PIXEL_EVENTS.checkout, REDDIT_PIXEL_EVENTS.checkout],
    }).toEqual({
      pageView: ["PageView", "PageVisit"],
      productView: ["ViewContent", "ViewContent"],
      checkout: ["InitiateCheckout", "AddToCart"],
    });
  });

  it("names the two server conversions in the Conversions API's spelling", () => {
    expect({
      accountCreated: [PIXEL_EVENTS.accountCreated, REDDIT_CONVERSION_EVENTS.accountCreated],
      enrolment: [PIXEL_EVENTS.enrolment, REDDIT_CONVERSION_EVENTS.enrolment],
    }).toEqual({
      accountCreated: ["Lead", "LEAD"],
      enrolment: ["CompleteRegistration", "SIGN_UP"],
    });
  });
});

describe("isValidRedditPixelId", () => {
  it("accepts an advertiser or a user account id", () => {
    expect(isValidRedditPixelId("a2_abc123def456")).toBe(true);
    expect(isValidRedditPixelId("t2_9xyz")).toBe(true);
    expect(isValidRedditPixelId("A2_ABC123")).toBe(true);
  });

  it("reads an unset variable or a placeholder as off", () => {
    expect(isValidRedditPixelId(undefined)).toBe(false);
    expect(isValidRedditPixelId("")).toBe(false);
    expect(isValidRedditPixelId("your-reddit-pixel-id")).toBe(false);
  });

  it("refuses Meta's digits, a bare prefix, and anything attached", () => {
    expect(isValidRedditPixelId("1234567890")).toBe(false);
    expect(isValidRedditPixelId("a2_")).toBe(false);
    expect(isValidRedditPixelId(" a2_abc123")).toBe(false);
    expect(isValidRedditPixelId("a2_abc123\n")).toBe(false);
    expect(isValidRedditPixelId("a2_abc-123")).toBe(false);
    expect(isValidRedditPixelId(`a2_${"a".repeat(33)}`)).toBe(false);
  });
});
