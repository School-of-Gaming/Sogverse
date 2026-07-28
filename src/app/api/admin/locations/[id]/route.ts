import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { updateLocationBody } from "@/services/locations/locations.contracts";

/**
 * PATCH /api/admin/locations/[id]
 *
 * See ../create/route.ts — `locations` writes run on the user-bound client
 * behind the admin_manage_locations policy.
 */
export const PATCH = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can update locations",
  // The id used to be checked for emptiness only, which let a malformed value
  // reach the database and come back as an unmapped driver error. A location
  // id is a uuid, so validating it here turns that into a plain 400.
  params: z.object({ id: z.string().uuid() }),
  body: updateLocationBody,

  // `no_data_found`: PostgREST raises PGRST116 when the id matches no row.
  // This route's id comes from the URL path, so an unknown one means the
  // resource is missing rather than the input being wrong — the shared table's
  // 404 is right and no override is needed. (It used to be a 400 carrying the
  // driver's own "0 rows returned" text.)

  handler: async ({ supabase, params, body }) => {
    const { data, error } = await supabase
      .from("locations")
      .update(body)
      .eq("id", params.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },
});
