// Constants specific to the v2 participation lifecycle.
// Pricing/discount constants live in src/lib/constants/pricing.ts and are
// shared with the existing v1 paths.

/**
 * How long a `reserving` participation row holds a seat before the cron's
 * count_seats_taken_v2 ignores it. Matched to Stripe Checkout's session
 * lifetime so a parent who completes Checkout never lands "completed-but-
 * expired" — see docs/products-redesign.md §4.6a.
 */
export const RESERVATION_LIFETIME_MINUTES = 30;

/**
 * Hours-before-session window inside which a cancellation no longer earns
 * a credit (sub-covered) or a no-charge (bundle-covered). Mirrors the
 * existing ENROLLMENT_CHARGE_WINDOW_HOURS — at cutover the v1 constant
 * collapses into this name.
 */
export const PARTICIPATION_CHARGE_WINDOW_HOURS = 24;
