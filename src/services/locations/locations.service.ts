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

  async createLocation(location: LocationInsert): Promise<Location> {
    const { data, error } = await this.supabase
      .from("locations")
      .insert(location)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateLocation(id: string, updates: Pick<Location, "name">): Promise<Location> {
    const { data, error } = await this.supabase
      .from("locations")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}
