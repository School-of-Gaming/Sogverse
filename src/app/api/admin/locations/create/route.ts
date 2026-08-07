import { defineRoute } from "@/lib/api/define-route";
import {
  LOCATION_COLUMNS,
  createLocationBody,
} from "@/services/locations/locations.contracts";

/**
 * POST /api/admin/locations/create
 *
 * `locations` is admin-only reference data. The write runs on the USER-bound
 * client: `authenticated` holds INSERT/UPDATE on the table and the
 * admin_manage_locations policy decides who may use it, so the route's role
 * check and the database's own answer have to agree before a row lands.
 *
 * **`country_code` is derived here, from the parent row, and any value the
 * client sent is discarded.** The column is denormalized onto every row purely
 * so country filtering needs no recursion — which means the parent's code is
 * the only value that can be correct, and a caller-supplied one is a second
 * source of truth for a field with exactly one. The venue dialog happens to
 * send the right code today; that is not a guarantee, and country-scoping the
 * dialog later depends on this being true of every row rather than of every
 * well-behaved client. The read is the same user-bound client, so a parent the
 * caller cannot see is simply "no such parent".
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can create locations",
  body: createLocationBody,

  // No per-route overrides. The route used to answer 400 for every code other
  // than the policy refusal; the shared table is strictly better here — a
  // duplicate name is a 409 rather than a 400, and a code nobody anticipated
  // is a logged 500 rather than being reported to the admin as their mistake.
  //
  // Message disclosure stays off: this route's failures were Postgres text
  // forwarded incidentally, never copy written for an admin to read.

  handler: async ({ supabase, body }) => {
    // A row with no parent is a country row, and nothing above `site` is ever
    // created from the application — so there is no parent to read a code
    // from, and the insert below will be refused by the table's own policy
    // rather than by a country code guessed here.
    let countryCode: string | null = null;
    if (body.parent_id !== null) {
      const { data: parent, error: parentError } = await supabase
        .from("locations")
        .select("country_code")
        .eq("id", body.parent_id)
        .single();

      // A missing parent falls through with a null code: the FK on parent_id
      // refuses the insert a moment later, which is the error the caller
      // should see rather than one this route invents.
      if (parentError && parentError.code !== "PGRST116") throw parentError;
      countryCode = parent?.country_code ?? null;
    }

    const { data, error } = await supabase
      .from("locations")
      .insert({ ...body, country_code: countryCode })
      // Named columns, not `select()`: the answer is parsed against
      // `locationRow`, which does not carry the generated search fold.
      .select(LOCATION_COLUMNS)
      .single();

    if (error) throw error;
    return data;
  },
});
