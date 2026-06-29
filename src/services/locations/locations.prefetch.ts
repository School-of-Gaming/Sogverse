import "server-only";

import { createClient } from "@/lib/supabase/server";
import { LocationsService } from "./locations.service";
import type { Location } from "@/types";

/**
 * Server-prefetch the full locations tree for a page's Server Component, so a
 * coverage picker paints complete on the first frame instead of popping in
 * after a client fetch (CLAUDE.md layout-shift rule). Callers pass the result
 * as `initialData` to `useAllLocations`, which still refetches on mount.
 *
 * `locations` is anon-readable reference data, so this works before any auth
 * session exists (e.g. the public register-gedu page). On any failure it
 * returns `[]` and the page still renders — the client hook refetches.
 */
export async function prefetchAllLocations(): Promise<Location[]> {
  try {
    const supabase = await createClient();
    return await new LocationsService(supabase).getAllLocations();
  } catch {
    return [];
  }
}
