import type { GamerPhotoConsent, GamerPhotoConsentType } from "@/types";

/**
 * Turn the stored rows for a set of gamers into the one answer every staff
 * surface asks of them: **may this child be in the photograph?**
 *
 * Pure, and deliberately outside any component — it is the whole of the
 * feature's central decision, and that decision is a rule about the data rather
 * than about a render.
 *
 * **An absent row is a real answer, and it is "no".** A gamer with no row has
 * either never been asked or never been answered for, and both render exactly
 * as a stored refusal: the child stays out of the photographs. So this map is
 * only ever consulted for a `true`; every id it does not carry, and every id it
 * carries a `false` for, is a child who must not be in the picture. A safeguard
 * whose default depended on whether anybody had got round to asking would not
 * be a safeguard.
 *
 * **A gamer is allowed only where EVERY consent the product asks for is
 * granted.** There is one such consent today, so the conjunction is invisible;
 * it is written this way because the day a second partner joins the enum is the
 * day a product can ask two things at once, and the answer to "may I take this
 * photograph" cannot be "for one of the two purposes". Failing closed on the
 * wider question is the direction every other rule here fails in.
 *
 * Rows for gamers outside the roster, and for consent types the product does
 * not ask for, are ignored rather than refused: the read is keyed by a list of
 * ids and returns whatever the policy lets through, and a caller pairing that
 * with a roster is not the place to police either.
 */
export function resolveGamerPhotoConsents(
  rows: readonly GamerPhotoConsent[],
  askedTypes: readonly GamerPhotoConsentType[],
): ReadonlyMap<string, boolean> {
  const allowed = new Map<string, boolean>();
  if (askedTypes.length === 0) return allowed;

  const asked = new Set<GamerPhotoConsentType>(askedTypes);
  const grantedTypes = new Map<string, Set<GamerPhotoConsentType>>();

  for (const row of rows) {
    if (!asked.has(row.consent_type)) continue;
    // Every gamer with a row of their own is named in the map, including the
    // ones whose answer is no — a caller asking "is there an answer on file" is
    // served by the key set, and one asking "may I photograph them" reads the
    // value and treats a miss as false.
    if (!allowed.has(row.gamer_id)) allowed.set(row.gamer_id, false);
    if (!row.granted) continue;

    const granted = grantedTypes.get(row.gamer_id) ?? new Set();
    granted.add(row.consent_type);
    grantedTypes.set(row.gamer_id, granted);
    if (granted.size >= asked.size) allowed.set(row.gamer_id, true);
  }

  return allowed;
}
