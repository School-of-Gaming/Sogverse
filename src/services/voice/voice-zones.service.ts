import type { AppSupabaseClient, VoiceZoneIcon, VoiceZoneColor } from "@/types";

/**
 * Browser-side writes for the persisted zone model. These are RLS-gated direct
 * table writes (no server secret needed), so they use the injected client
 * rather than a fetch() to an API route — the database policies
 * (is_voice_group_moderator) are the authority. Reads + realtime live in the
 * `use-zone-data` hook; the locked-room token mint lives in VoiceService.
 */
export class VoiceZonesService {
  constructor(private readonly supabase: AppSupabaseClient) {}

  /** Place a gamer into a locked zone (moderator-only at the RLS layer). The
   *  gamer's own client reacts to the realtime insert and switches rooms. */
  async placeInLockedZone(input: {
    zoneId: string;
    gamerId: string;
    groupId: string;
    placedBy: string;
    sessionOpensAt: string;
    /** Display-name snapshot so outsiders (incl. late joiners) can label the
     *  blurred roster without the gamer's Daily token or a profiles read. */
    gamerName: string | null;
  }): Promise<void> {
    // Re-placing a gamer (next session, or moving them to a different locked
    // zone) must overwrite their existing row, which collides with the
    // (group_id, gamer_id) unique constraint. The table is insert/delete only
    // (no UPDATE policy/grant — so an `upsert`'s ON CONFLICT DO UPDATE would be
    // RLS-denied), so clear any existing placement for this gamer first, then
    // insert. Single actor + rare action, so the non-atomic gap is immaterial.
    await this.supabase
      .from("voice_locked_placements")
      .delete()
      .eq("group_id", input.groupId)
      .eq("gamer_id", input.gamerId);
    const { error } = await this.supabase.from("voice_locked_placements").insert({
      zone_id: input.zoneId,
      gamer_id: input.gamerId,
      group_id: input.groupId,
      placed_by: input.placedBy,
      session_opens_at: input.sessionOpensAt,
      gamer_name: input.gamerName,
    });
    if (error) throw new Error(error.message);
  }

  /** Remove a gamer's placement; their client returns to the main room. */
  async removeFromLockedZone(input: { groupId: string; gamerId: string }): Promise<void> {
    const { error } = await this.supabase
      .from("voice_locked_placements")
      .delete()
      .eq("group_id", input.groupId)
      .eq("gamer_id", input.gamerId);
    if (error) throw new Error(error.message);
  }

  async createZone(input: {
    groupId: string;
    name: string;
    icon: VoiceZoneIcon;
    color: VoiceZoneColor;
    isLocked: boolean;
    createdBy: string;
  }): Promise<void> {
    const { error } = await this.supabase.from("voice_zones").insert({
      group_id: input.groupId,
      name: input.name,
      icon: input.icon,
      color: input.color,
      is_locked: input.isLocked,
      created_by: input.createdBy,
    });
    if (error) throw new Error(error.message);
  }

  async updateZone(
    id: string,
    patch: { name?: string; icon?: VoiceZoneIcon; color?: VoiceZoneColor },
  ): Promise<void> {
    const { error } = await this.supabase.from("voice_zones").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async deleteZone(id: string): Promise<void> {
    const { error } = await this.supabase.from("voice_zones").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }
}
