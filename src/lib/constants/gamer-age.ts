// Single source of truth for the gamer age bands.
//
// Two related-but-distinct ranges live here. The PRODUCT range is the one age
// span products realistically serve. The ENROLLMENT range (used by the Add
// Gamer form) is deliberately one year wider on each side so month/DOB boundary
// cases never lock a real 7- or 17-year-old out of creating an account — it
// derives from the product range, so changing one number moves the enrollment
// window with it.
//
// The shop/schools age filter doesn't offer one chip per year; it groups ages
// into the coarse bands parents actually shop by — see PRODUCT_AGE_BANDS.

/** Youngest age a product is expected to serve. */
export const MIN_PRODUCT_AGE = 7;
/** Oldest age a product is expected to serve. */
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

/** An inclusive age band offered by the shop/schools age filter. */
export interface AgeBand {
  readonly min: number;
  readonly max: number;
}

/**
 * The age bands the shop/schools age filter offers, in ascending order. Parents
 * shop by broad age groups rather than a single year, so the filter groups the
 * product range into these coarse bands. A product matches a selected band when
 * its [min_age, max_age] overlaps the band (see `filterProducts`).
 */
export const PRODUCT_AGE_BANDS: readonly AgeBand[] = [
  { min: 7, max: 9 },
  { min: 10, max: 12 },
  { min: 13, max: 16 },
];

/** Find the offered band matching an exact [min, max], or null if none does. */
export function findAgeBand(min: number, max: number): AgeBand | null {
  return (
    PRODUCT_AGE_BANDS.find((b) => b.min === min && b.max === max) ?? null
  );
}
