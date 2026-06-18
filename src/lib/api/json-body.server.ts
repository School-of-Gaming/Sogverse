import { NextResponse } from "next/server";
import type { z } from "zod";

/**
 * Validate an already-decoded body value against its contract schema.
 *
 * Returns the typed, validated value — or a ready-to-return 400 response.
 * Use this directly when the JSON arrives some other way than the request
 * body (e.g. a JSON string inside a multipart form field); use
 * `parseJsonBody` for plain JSON requests.
 */
export function parseBodyValue<T>(
  value: unknown,
  schema: z.ZodType<T>
): T | NextResponse {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue.path.join(".");
    return NextResponse.json(
      { error: path === "" ? issue.message : `${path}: ${issue.message}` },
      { status: 400 }
    );
  }
  return parsed.data;
}

/**
 * Parse and validate a route's JSON request body against its contract schema.
 *
 * Returns the typed, validated body — or a ready-to-return 400 response when
 * the body is malformed. Callers follow the same shape as `requireRole`:
 *
 *   const body = await parseJsonBody(request, createLocationBody);
 *   if (body instanceof NextResponse) return body;
 *
 * The schema lives in the feature's `*.contracts.ts` file alongside the
 * response schema the calling service parses with, so both directions of the
 * contract are defined in one place.
 */
export async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>
): Promise<T | NextResponse> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  return parseBodyValue(raw, schema);
}
