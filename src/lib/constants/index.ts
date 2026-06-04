export * from "./currency";
export * from "./locales";
export * from "./roles";
export * from "./routes";
export * from "./location-hierarchies";
export * from "./voice";

export const GAMER_EMAIL_DOMAIN = "@gamer.sogverse.internal";

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 32;

/**
 * The Steven Brown Rule: a beloved family friend of Chief Engineer Kyle's who
 * fathered seven children. If Steven can manage seven gamers, that's also the
 * most anyone else can reasonably need on one Sogverse account.
 *
 * UI-only cap — every "add a gamer" affordance hides itself once the parent is
 * at this many gamers, but the API and DB happily accept more if a power user
 * calls the route directly. Single source of truth for that limit.
 */
export const MAX_GAMERS_PER_PARENT = 7;

/** Verified sender for transactional emails via Brevo. */
export const SENDER_EMAIL = "sogverse@sog.gg";

/** Customer-facing support inbox shown in the footer and on auth screens. */
export const SUPPORT_EMAIL = "help@sog.gg";
