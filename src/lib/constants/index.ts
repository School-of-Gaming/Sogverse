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

/**
 * Verified sender for transactional emails via Brevo.
 *
 * Deliberately *not* `SUPPORT_EMAIL`, and the one place the two diverge. This
 * address is a sending identity Brevo has verified (DKIM/SPF signed for it), so
 * changing it is a deliverability change rather than a copy one — mail from an
 * unverified From lands in spam or is rejected outright. `SUPPORT_EMAIL` is the
 * address a human is invited to write to, and it is already the Reply-To on
 * every template, so a parent who hits reply reaches the inbox we answer.
 */
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
 * The brand alone, not the `School of Gaming – Sogverse` lockup: an inbox list
 * truncates the sender column hard, and a lockup cut mid-word is worse than the
 * short name that always fits. The full lockup lives in the email's own header,
 * where there is room for it — see the brand-vs-platform rule in the root
 * CLAUDE.md.
 */
export const SENDER_NAME = "School of Gaming";

/**
 * The one customer-facing address, and the source of truth for it.
 *
 * Shown in the footer and on the auth screens, used as the Reply-To on every
 * transactional email, and named by the legal pages through their
 * `{supportEmail}` placeholder rather than spelled out per document — a literal
 * in `messages/` is how we ended up with three different addresses across four
 * legal documents, in five languages, with no way to notice from English.
 * Anything customer-facing points here; nothing introduces a second address.
 */
export const SUPPORT_EMAIL = "help@sog.gg";
