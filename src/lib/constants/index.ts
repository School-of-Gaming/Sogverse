export * from "./currency";
export * from "./game-platforms";
export * from "./locales";
export * from "./roles";
export * from "./routes";
export * from "./location-hierarchies";
export * from "./session-epoch";
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

/**
 * Sender display name on every transactional email, whatever the template.
 *
 * Deliberately one literal rather than a per-locale translation: this is the
 * company's mark, and a recipient who has seen it once should recognise it in
 * the inbox list next time regardless of which language the body is in. Same
 * reasoning as "My SOG" — locales translate the copy around a brand name, not
 * the name.
 *
 * Brand first, platform second: "School of Gaming" is what a parent recognises,
 * "Sogverse" is what they log in to. An inbox list truncates, and the half worth
 * keeping is the half they already know. See the brand-vs-platform rule in the
 * root CLAUDE.md.
 */
export const SENDER_NAME = "School of Gaming – Sogverse";

/** Customer-facing support inbox shown in the footer and on auth screens. */
export const SUPPORT_EMAIL = "help@sog.gg";
