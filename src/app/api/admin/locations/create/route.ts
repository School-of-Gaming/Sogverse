import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api/json-body.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createLocationBody } from "@/services/locations/locations.contracts";

// `locations` is admin-only reference data — DML grants on the table are
// revoked from `authenticated` (see migration 00021). Writes have to go
// through the service-role admin client, which bypasses the grant.

export async function POST(request: Request) {
  const result = await requireRole("admin", {
    forbiddenMessage: "Only admins can create locations",
  });
  if (result instanceof NextResponse) return result;

  const body = await parseJsonBody(request, createLocationBody);
  if (body instanceof NextResponse) return body;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("locations")
    .insert(body)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data);
}
