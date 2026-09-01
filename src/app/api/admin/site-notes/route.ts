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
 *
 * **A field absent from the request is left alone — it is not written null.**
 * The member row carries two independent things with two different owners: the
 * site's street address, which only an admin edits, and the family-facing site
 * note, which the session-record panel writes through an RPC that admins and
 * gedus share. Treating an omitted key as "set it to null" made those two
 * writers clobber each other — an address save would blank a note somebody had
 * just written, and the caller would have had to echo back a cached copy of the
 * other field to avoid it, which is exactly the stale-copy bug the site-notes
 * RPC dropped its address parameter to kill.
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
      // Only the keys the request actually carried. `upsert` builds its
      // ON CONFLICT assignment list from the payload's own keys, so an omitted
      // one is neither inserted nor updated — which is the whole of the
      // leave-it-alone guarantee above.
      const member: { location_id: string; address?: string | null; notes?: string | null } =
        { location_id: locationId };
      if (body.member.address !== undefined) {
        member.address = body.member.address?.trim() || null;
      }
      if (body.member.notes !== undefined) {
        member.notes = body.member.notes?.trim() || null;
      }

      // A `member` object naming neither field asks for nothing. Upserting the
      // primary key alone is an UPDATE with an empty SET list, which Postgres
      // refuses — so answer it as the no-op it is.
      if (member.address !== undefined || member.notes !== undefined) {
        const { error } = await supabase
          .from("site_details")
          .upsert(member, { onConflict: "location_id" });
        if (error) throw error;
      }
    }

    if (body.staff?.notes !== undefined) {
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
