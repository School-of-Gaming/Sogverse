// Single source of truth for the gamer age bands.
//
// Two related-but-distinct ranges live here. The PRODUCT range is the one age
// span products realistically serve and the only range the shop age filter
// offers. The ENROLLMENT range (used by the Add Gamer form) is deliberately
// one year wider on each side so month/DOB boundary cases never lock a real
// 7- or 17-year-old out of creating an account. Everything derives from the
// product range, so changing one number moves the filter and the enrollment
// window together.

/** Youngest age a product is expected to serve — and the lowest filter option. */
export const MIN_PRODUCT_AGE = 7;
/** Oldest age a product is expected to serve — and the highest filter option. */
export const MAX_PRODUCT_AGE = 17;

/**
 * Extra slack the Add Gamer form allows on each side of the product range.
 * Boundary months/DOBs can technically resolve to one year under/over the
 * intended band; padding keeps those real kids enrollable.
 */
export const ENROLLMENT_AGE_PADDING = 1;

/** Youngest age the Add Gamer form accepts (= product min minus padding). */
export const MIN_ENROLLMENT_AGE = MIN_PRODUCT_AGE - ENROLLMENT_AGE_PADDING;
/** Oldest age the Add Gamer form accepts (= product max plus padding). */
export const MAX_ENROLLMENT_AGE = MAX_PRODUCT_AGE + ENROLLMENT_AGE_PADDING;

/**
 * Ascending list of the ages the shop age filter offers (product range,
 * inclusive). e.g. [7, 8, …, 17].
 */
export function productAgeOptions(): number[] {
  return Array.from(
    { length: MAX_PRODUCT_AGE - MIN_PRODUCT_AGE + 1 },
    (_, i) => MIN_PRODUCT_AGE + i,
  );
}
