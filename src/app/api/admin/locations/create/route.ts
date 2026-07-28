import { defineRoute } from "@/lib/api/define-route";
import { createLocationBody } from "@/services/locations/locations.contracts";

/**
 * POST /api/admin/locations/create
 *
 * `locations` is admin-only reference data. The write runs on the USER-bound
 * client: `authenticated` holds INSERT/UPDATE on the table and the
 * admin_manage_locations policy decides who may use it, so the route's role
 * check and the database's own answer have to agree before a row lands.
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
    const { data, error } = await supabase
      .from("locations")
      .insert(body)
      .select()
      .single();

    if (error) throw error;
    return data;
  },
});
