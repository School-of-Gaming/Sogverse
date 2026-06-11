import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api/json-body.server";
import { updateSiteNotesBody } from "@/services/products/reference-data.contracts";

// PATCH /api/admin/site-notes
// Body: { location_id, member?: { address?, notes? }, staff?: { notes? } }
//
// Upserts the corresponding site_details / site_staff_details row by
// location_id. Either side is optional; sending only the half that's being
// edited keeps the request shape obvious. RLS already restricts both writes
// to admin, so no extra gating beyond requireRole is needed.

export async function PATCH(request: Request) {
  const result = await requireRole("admin", {
    forbiddenMessage: "Only admins can edit site notes",
  });
  if (result instanceof NextResponse) return result;
  const { supabase } = result;

  const body = await parseJsonBody(request, updateSiteNotesBody);
  if (body instanceof NextResponse) return body;
  const locationId = body.location_id;

  if (body.member) {
    const memberRow = {
      location_id: locationId,
      address: body.member.address?.trim() || null,
      notes: body.member.notes?.trim() || null,
    };
    const { error } = await supabase
      .from("site_details")
      .upsert(memberRow, { onConflict: "location_id" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  if (body.staff) {
    const staffRow = {
      location_id: locationId,
      notes: body.staff.notes?.trim() || null,
    };
    const { error } = await supabase
      .from("site_staff_details")
      .upsert(staffRow, { onConflict: "location_id" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}
