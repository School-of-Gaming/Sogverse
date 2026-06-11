import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api/json-body.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateLocationBody } from "@/services/locations/locations.contracts";

// See ../create/route.ts — `locations` writes go through the admin client
// because table DML is revoked from `authenticated`.

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole("admin", {
    forbiddenMessage: "Only admins can update locations",
  });
  if (result instanceof NextResponse) return result;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const body = await parseJsonBody(request, updateLocationBody);
  if (body instanceof NextResponse) return body;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("locations")
    .update(body)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data);
}
