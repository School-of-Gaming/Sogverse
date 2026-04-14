import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, GeduLocation } from "@/types";

export class GeduLocationsService {
  constructor(private supabase: SupabaseClient<Database>) {}

  async getForGedu(geduId: string): Promise<GeduLocation[]> {
    const { data, error } = await this.supabase
      .from("gedu_locations")
      .select("*")
      .eq("gedu_id", geduId);

    if (error) throw error;
    return data;
  }

  /**
   * Replace a gedu's entire coverage set. Simple DELETE + INSERT — volumes
   * are small (a gedu has maybe dozens of rows, not thousands) and RLS
   * enforces that the caller can only write their own rows (or admin can
   * write any). No RPC needed.
   */
  async setForGedu(geduId: string, locationIds: string[]): Promise<void> {
    const { error: deleteError } = await this.supabase
      .from("gedu_locations")
      .delete()
      .eq("gedu_id", geduId);

    if (deleteError) throw deleteError;

    if (locationIds.length === 0) return;

    const rows = locationIds.map((location_id) => ({ gedu_id: geduId, location_id }));
    const { error: insertError } = await this.supabase
      .from("gedu_locations")
      .insert(rows);

    if (insertError) throw insertError;
  }
}
