import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";

// PATCH /api/admin/site-notes-v2
// Body: { location_id, member?: { address?, notes? }, staff?: { notes? } }
//
// Upserts the corresponding site_details_v2 / site_staff_details_v2 row by
// location_id. Either side is optional; sending only the half that's being
// edited keeps the request shape obvious. RLS already restricts both writes
// to admin, so no extra gating beyond requireRole is needed.

export async function PATCH(request: Request) {
  const result = await requireRole("admin", {
    forbiddenMessage: "Only admins can edit site notes",
  });
  if (result instanceof NextResponse) return result;
  const { supabase } = result;

  let body: {
    location_id?: string;
    member?: { address?: string | null; notes?: string | null };
    staff?: { notes?: string | null };
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const locationId = body.location_id;
  if (!locationId) {
    return NextResponse.json({ error: "location_id is required" }, { status: 400 });
  }
  if (!body.member && !body.staff) {
    return NextResponse.json(
      { error: "Provide at least one of 'member' or 'staff'" },
      { status: 400 }
    );
  }

  if (body.member) {
    const memberRow = {
      location_id: locationId,
      address: body.member.address?.trim() || null,
      notes: body.member.notes?.trim() || null,
    };
    const { error } = await supabase
      .from("site_details_v2")
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
      .from("site_staff_details_v2")
      .upsert(staffRow, { onConflict: "location_id" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}
