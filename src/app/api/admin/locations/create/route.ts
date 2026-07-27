import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api/json-body.server";
import { createLocationBody } from "@/services/locations/locations.contracts";

// `locations` is admin-only reference data. The write runs on the USER-bound
// client: `authenticated` holds INSERT/UPDATE on the table and the
// admin_manage_locations policy decides who may use it, so the route's role
// check and the database's own answer have to agree before a row lands.

export async function POST(request: Request) {
  const result = await requireRole("admin", {
    forbiddenMessage: "Only admins can create locations",
  });
  if (result instanceof NextResponse) return result;
  const { supabase } = result;

  const body = await parseJsonBody(request, createLocationBody);
  if (body instanceof NextResponse) return body;

  const { data, error } = await supabase
    .from("locations")
    .insert(body)
    .select()
    .single();

  if (error) {
    // 42501 is PostgreSQL's own refusal (grant or policy); anything else is the
    // payload failing a constraint.
    const status = error.code === "42501" ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json(data);
}
