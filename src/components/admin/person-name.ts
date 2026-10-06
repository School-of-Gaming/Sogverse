/**
 * An embedded profile's display name, or `null` where there is no profile to
 * name — an absent embed (a departed admin, `ON DELETE SET NULL`), or one whose
 * row is all blanks.
 *
 * Every audit name on the admin cards goes through it, so each is written the
 * same way and none can drift into printing a lone space for a half-filled
 * profile.
 */
export function personName(
  person: { first_name: string | null; last_name: string | null } | null | undefined,
): string | null {
  if (!person) return null;
  const name = [person.first_name, person.last_name].filter(Boolean).join(" ");
  return name === "" ? null : name;
}
