// Constants for the admin surfaces that list people.

/**
 * How many rows one page of an admin people list carries.
 *
 * Read by every surface that pages people off the same server-searched read —
 * the admin users list and the pickers that choose a person for a product — and
 * deliberately the single point of control for all of them. The number is not
 * merely cosmetic there: a keyset page shorter than the size it asked for is how
 * "there is nothing after this" is decided, so a surface that sized its own page
 * differently from the read behind it would be answering that question wrongly,
 * either stopping early or spending a request to discover an empty page.
 *
 * 25 is a screenful and a little on a desktop admin list, which is what infinite
 * scroll wants: the first page fills the viewport so there is something to scroll
 * through, and it is small enough that a search narrowing to a handful of people
 * costs one short response rather than a whole table.
 */
export const ADMIN_PEOPLE_LIST_PAGE_SIZE = 25;
