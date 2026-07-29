import type { Location, LocationInsert, AppSupabaseClient } from "@/types";
import {
  parseJsonResponse,
  readErrorMessage,
} from "@/lib/api/json-response";
import { locationRow } from "./locations.contracts";

/**
 * PostgREST caps every response at its `max_rows` setting (1000 on this
 * project) and enforces it by returning a *short page*, not an error — so an
 * unbounded select is indistinguishable from a complete one and truncates
 * silently. The locations tree shares that one budget across every country,
 * and France's communes materialize into it over time, so the cap is a matter
 * of when, not if. Keep this in step with the server setting: a value larger
 * than `max_rows` makes every page look short and the walk stops at the cap
 * again; a smaller one just costs extra round-trips.
 */
const LOCATIONS_PAGE_SIZE = 1000;

/**
 * Refuses to page forever if the server ever stops honouring the range (which
 * would return a full page every time). 100 pages is ~100k rows — two orders
 * of magnitude past the whole of France.
 */
const LOCATIONS_MAX_PAGES = 100;

export class LocationsService {
  constructor(private supabase: AppSupabaseClient) {}

  async getAllLocations(): Promise<Location[]> {
    const all: Location[] = [];

    for (let page = 0; page < LOCATIONS_MAX_PAGES; page++) {
      const from = page * LOCATIONS_PAGE_SIZE;
      const { data, error } = await this.supabase
        .from("locations")
        .select("*")
        // Paging needs a *total* order or rows shift between requests and the
        // walk both duplicates and drops them. `name` alone is not one: every
        // French DROM has a région and a département of the same name, and
        // homonymous communes are common.
        .order("name")
        .order("id")
        .range(from, from + LOCATIONS_PAGE_SIZE - 1);

      if (error) throw error;
      all.push(...data);

      // A short page is PostgREST saying there is nothing after it.
      if (data.length < LOCATIONS_PAGE_SIZE) return all;
    }

    throw new Error(
      `getAllLocations: still receiving full pages after ${LOCATIONS_MAX_PAGES} requests — the range filter is not being applied`
    );
  }

  async getLocation(id: string): Promise<Location> {
    const { data, error } = await this.supabase
      .from("locations")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data;
  }

  // `locations` writes go through the admin API (the table's DML grants are
  // revoked from `authenticated` per migration 00021 — see CLAUDE.md
  // service-layer pattern). The injected `supabase` client is unused by
  // these methods, kept for symmetry with the read methods.
  async createLocation(location: LocationInsert): Promise<Location> {
    const response = await fetch("/api/admin/locations/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(location),
    });
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Failed to create location")
      );
    }
    return parseJsonResponse(response, locationRow);
  }

  async updateLocation(
    id: string,
    updates: Pick<Location, "name">
  ): Promise<Location> {
    const response = await fetch(
      `/api/admin/locations/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      }
    );
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Failed to update location")
      );
    }
    return parseJsonResponse(response, locationRow);
  }
}
