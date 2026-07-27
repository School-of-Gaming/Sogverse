import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api/json-body.server";
import { updateLocationBody } from "@/services/locations/locations.contracts";

// See ../create/route.ts — `locations` writes run on the user-bound client
// behind the admin_manage_locations policy.

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireRole("admin", {
    forbiddenMessage: "Only admins can update locations",
  });
  if (result instanceof NextResponse) return result;
  const { supabase } = result;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const body = await parseJsonBody(request, updateLocationBody);
  if (body instanceof NextResponse) return body;

  const { data, error } = await supabase
    .from("locations")
    .update(body)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    const status = error.code === "42501" ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json(data);
}
