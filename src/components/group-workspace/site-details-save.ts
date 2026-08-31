import type { SiteDetailsDraft } from "./SitePanel";

/**
 * What writing a site's **name and address** does between the panel and the two
 * routes behind them.
 *
 * **Exactly one surface binds this today: the admin site page, which *is* the
 * site record.** It briefly had three — the group details page and the product
 * form's site field bound it too — and both lost it to a scope ruling rather
 * than to a refactor: those pages are scoped to a product, so an edit made on
 * one reads as a change to that product while landing on every product in the
 * building. They link to the site page instead. Read that as the reason this
 * module is not deleted for having one caller: what it holds is the *record's*
 * save rules, and where they may be invoked from has already moved once.
 *
 * It also stays a module rather than an inline handler because it is the same
 * kind of split `session-entry-saves.ts` and `game-username-save.ts` make: what
 * happens between one Save and two writes is a rule about the record, not a
 * per-page decision, and a second copy of it is a second place for a half-failed
 * save to behave differently.
 *
 * The rules:
 *
 * - **The two fields sit in two tables behind two routes, and none of that is
 *   the admin's problem.** The name is a `locations` column on the location
 *   update route; the address hangs off `site_details` on the site-notes route.
 *   A seam in the schema is not a reason to ask somebody editing one building
 *   to save its details twice.
 * - **Only what changed is written**, which the panel decides and this trusts:
 *   an absent half is never sent, because each route leaves a field it was not
 *   given alone, and sending an untouched value would put it back over
 *   whatever somebody else corrected in between.
 * - **Both writes are attempted even when the first is refused**, and the
 *   refusals are gathered rather than raced — a name that saved is saved, and
 *   the panel re-seeds it while leaving the address dirty for the retry.
 * - **Each mutation's promise carries its own invalidations**, which is why
 *   they are awaited one at a time: the Save that fired this stays disabled
 *   until the page holds the values it just wrote, rather than re-enabling over
 *   text it is about to replace.
 */

/** The two writes, structurally as the surface's React Query hooks hand them back. */
export interface SiteDetailsSaveMutations {
  /** The location update route: renames the site row itself. */
  rename: {
    mutateAsync: (vars: {
      id: string;
      updates: { name: string };
    }) => Promise<unknown>;
  };
  /**
   * The site-notes route, carrying the address alone. The notes travel on
   * their own save, so this must never be handed a `notes` field, or one
   * control would start writing the other's stale value back.
   */
  updateAddress: {
    mutateAsync: (vars: {
      location_id: string;
      member: { address: string };
    }) => Promise<unknown>;
  };
}

export interface SiteDetailsSaveArgs extends SiteDetailsSaveMutations {
  /** The site's `locations` row id — the same id both routes take. */
  locationId: string;
}

/**
 * Bind the site panel's details save to one site and one surface's mutations.
 *
 * Called during render, exactly where an inline handler would otherwise be
 * written. Rejects if either write was refused, which is what the
 * panel reads as "leave the editor open and say so".
 */
export function createSiteDetailsSave({
  locationId,
  rename,
  updateAddress,
}: SiteDetailsSaveArgs): (draft: SiteDetailsDraft) => Promise<void> {
  return async ({ name, address }) => {
    const failures: string[] = [];

    if (name !== undefined) {
      try {
        await rename.mutateAsync({ id: locationId, updates: { name } });
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }

    if (address !== undefined) {
      try {
        await updateAddress.mutateAsync({
          location_id: locationId,
          member: { address },
        });
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }

    if (failures.length > 0) throw new Error(failures.join("; "));
  };
}
