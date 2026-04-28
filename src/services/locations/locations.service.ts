import type { SupabaseClient } from "@supabase/supabase-js";
import type { Location, LocationInsert, Database } from "@/types";

export class LocationsService {
  constructor(private supabase: SupabaseClient<Database>) {}

  async getAllLocations(): Promise<Location[]> {
    const { data, error } = await this.supabase
      .from("locations")
      .select("*")
      .order("name");

    if (error) throw error;
    return data;
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
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(data.error ?? "Failed to create location");
    }
    return (await response.json()) as Location;
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
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(data.error ?? "Failed to update location");
    }
    return (await response.json()) as Location;
  }
}
