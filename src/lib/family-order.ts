/**
 * Order family members by first name, collated in the **viewer's own locale**
 * and tie-broken by id.
 *
 * The collation is not the runtime's, because a Finnish family's Ämmi belongs
 * after Zeno, and a comparator that agreed with that on the server and
 * disagreed in the browser would rearrange the row on hydration, under the
 * cursor of somebody already reaching for one.
 *
 * The id breaks a tie because a first name does not have to be unique: two
 * children in one family may share one, and the family read imposes no order of
 * its own, so a comparator returning 0 would leave that pair in whatever order
 * Postgres happened to answer with — free to differ between two fetches. The id
 * is arbitrary as an ordering; what it buys is the *same* arbitrary order every
 * time.
 *
 * Shared rather than duplicated: the profile selector and the header's account
 * menu list the same people, and the two lists disagreeing on their order would
 * read as one of them being wrong. Typed structurally (anything with an id and
 * a first name) so this stays a `lib` module with no dependency on the family
 * service that supplies its rows.
 */
export function byFirstName<T extends { id: string; first_name: string }>(
  locale: string,
) {
  return (a: T, b: T): number =>
    a.first_name.localeCompare(b.first_name, locale) ||
    a.id.localeCompare(b.id);
}
