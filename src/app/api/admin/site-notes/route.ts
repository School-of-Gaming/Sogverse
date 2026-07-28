import { defineRoute } from "@/lib/api/define-route";
import {
  updateSiteNotesBody,
  updateSiteNotesResponse,
} from "@/services/products/reference-data.contracts";

/**
 * PATCH /api/admin/site-notes
 *
 * Upserts the corresponding site_details / site_staff_details row by
 * location_id. Either side is optional; sending only the half that's being
 * edited keeps the request shape obvious. RLS already restricts both writes
 * to admin, so no extra gating beyond the role posture is needed.
 */
export const PATCH = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can edit site notes",
  body: updateSiteNotesBody,
  response: updateSiteNotesResponse,

  // No overrides and no disclosure. Both upserts used to answer 400 carrying
  // the driver's own text for any failure; on the shared table a policy refusal
  // is a 403, a bad location_id is a 400 foreign-key violation, and anything
  // unrecognized is a logged 500.

  handler: async ({ supabase, body }) => {
    const locationId = body.location_id;

    if (body.member) {
      const { error } = await supabase.from("site_details").upsert(
        {
          location_id: locationId,
          address: body.member.address?.trim() || null,
          notes: body.member.notes?.trim() || null,
        },
        { onConflict: "location_id" },
      );
      if (error) throw error;
    }

    if (body.staff) {
      const { error } = await supabase.from("site_staff_details").upsert(
        {
          location_id: locationId,
          notes: body.staff.notes?.trim() || null,
        },
        { onConflict: "location_id" },
      );
      if (error) throw error;
    }

    return { ok: true } as const;
  },
});
