// Constants specific to the v2 participation lifecycle.
// Pricing/discount constants live in src/lib/constants/pricing.ts and are
// shared with the existing v1 paths.

/**
 * Stripe Checkout session lifetime. Stripe enforces a 30-minute minimum on
 * `expires_at`, so this is also the floor for how long a reservation can be
 * held. The DB-side reservation has no separate timer: status='reserving'
 * holds the seat until either Stripe fires session.completed (→ confirm)
 * or session.expired (→ expire). See docs/products-v2-architecture.md
 * "Movie-ticket reservation model".
 */
export const RESERVATION_LIFETIME_MINUTES = 30;

/**
 * Hours-before-session window inside which a cancellation no longer earns
 * a credit (sub-covered) or a no-charge (bundle-covered). Mirrors the
 * existing ENROLLMENT_CHARGE_WINDOW_HOURS — at cutover the v1 constant
 * collapses into this name.
 */
export const PARTICIPATION_CHARGE_WINDOW_HOURS = 24;
