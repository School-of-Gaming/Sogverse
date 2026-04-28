import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Location, LocationInsert, LocationType } from "@/types";

// `locations` is admin-only reference data — DML grants on the table are
// revoked from `authenticated` (see migration 00021). Writes have to go
// through the service-role admin client, which bypasses the grant.

const VALID_TYPES: readonly LocationType[] = [
  "country",
  "region",
  "municipality",
  "district",
  "site",
];

export async function POST(request: Request) {
  const result = await requireRole("admin", {
    forbiddenMessage: "Only admins can create locations",
  });
  if (result instanceof NextResponse) return result;

  let body: Partial<LocationInsert>;
  try {
    body = (await request.json()) as Partial<LocationInsert>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!body.type || !VALID_TYPES.includes(body.type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
  if (body.parent_id !== null && typeof body.parent_id !== "string") {
    return NextResponse.json({ error: "Invalid parent_id" }, { status: 400 });
  }

  const insert: LocationInsert = {
    name,
    type: body.type,
    parent_id: body.parent_id ?? null,
    country_code: body.country_code ?? null,
  };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("locations")
    .insert(insert)
    .select()
    .single<Location>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data);
}
