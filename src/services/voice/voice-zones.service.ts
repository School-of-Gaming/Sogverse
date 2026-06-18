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

  /**
   * Record that a user occupies a private (locked) zone this session window —
   * the server-readable privacy boundary (RLS: moderators only). One method
   * covers both write-paths: a mod placing a *gamer* (`userId` = the gamer,
   * `placedBy` = the mod) and a mod recording *their own* entry (`userId` =
   * `placedBy` = self). The token endpoint + the live `canReceive` projection
   * read these rows; no Daily room switch happens.
   */
  async occupyPrivateZone(input: {
    zoneId: string;
    userId: string;
    groupId: string;
    placedBy: string;
    sessionOpensAt: string;
  }): Promise<void> {
    // Re-occupying (a different zone, or a re-place) must overwrite the existing
    // row, which collides with the (group_id, user_id) unique constraint. The
    // table is insert/delete only (no UPDATE policy/grant — an upsert's ON
    // CONFLICT DO UPDATE would be RLS-denied), so clear any existing row for
    // this user first, then insert. Single actor + rare action, so the
    // non-atomic gap is immaterial.
    await this.supabase
      .from("voice_private_zone_occupants")
      .delete()
      .eq("group_id", input.groupId)
      .eq("user_id", input.userId);
    const { error } = await this.supabase.from("voice_private_zone_occupants").insert({
      zone_id: input.zoneId,
      user_id: input.userId,
      group_id: input.groupId,
      placed_by: input.placedBy,
      session_opens_at: input.sessionOpensAt,
    });
    if (error) throw new Error(error.message);
  }

  /** Remove a user's private-zone occupancy (a mod freeing a placed gamer, or a
   *  mod leaving a private zone they walked into). Moderators only at the RLS
   *  layer. */
  async vacatePrivateZone(input: { groupId: string; userId: string }): Promise<void> {
    const { error } = await this.supabase
      .from("voice_private_zone_occupants")
      .delete()
      .eq("group_id", input.groupId)
      .eq("user_id", input.userId);
    if (error) throw new Error(error.message);
  }

  async createZone(input: {
    groupId: string;
    /** null → an unnamed zone, identified by icon + color alone. */
    name: string | null;
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
    patch: { name?: string | null; icon?: VoiceZoneIcon; color?: VoiceZoneColor },
  ): Promise<void> {
    const { error } = await this.supabase.from("voice_zones").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async deleteZone(id: string): Promise<void> {
    const { error } = await this.supabase.from("voice_zones").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }
}
