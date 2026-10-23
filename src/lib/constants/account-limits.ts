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
