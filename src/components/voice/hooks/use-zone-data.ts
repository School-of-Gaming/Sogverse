import { useEffect, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { getClient } from "@/lib/supabase/client";
import type { VoiceZone, VoiceLockedPlacement } from "@/types";

/**
 * Live custom-zone + locked-placement data for a group room, sourced from the
 * DB (the only persisted part of the zone model). Instant rooms pass
 * `groupId === null` and get empty lists — no group to tie persistence to.
 *
 * Both lists are seeded with an initial fetch on mount and then kept current by
 * a Supabase Realtime subscription filtered by `group_id`. Per the CLAUDE.md
 * realtime rule, the subscription callback never makes a Supabase query — it
 * applies the change straight from the payload. That's why the migration set
 * REPLICA IDENTITY FULL on both tables: DELETE payloads carry the full old row,
 * so a `group_id`-filtered subscription actually receives deletions.
 */
export function useZoneData(groupId: string | null) {
  const supabase = getClient();
  const [customZones, setCustomZones] = useState<VoiceZone[]>([]);
  const [placements, setPlacements] = useState<VoiceLockedPlacement[]>([]);

  useEffect(() => {
    // Instant rooms (null group) keep the empty initial state — no group to
    // tie persistence to.
    if (!groupId) return;
    const gid = groupId;

    let cancelled = false;

    // Initial fetch (outside the realtime callback — allowed).
    async function load() {
      const [zonesRes, placementsRes] = await Promise.all([
        supabase.from("voice_zones").select("*").eq("group_id", gid),
        supabase.from("voice_locked_placements").select("*").eq("group_id", gid),
      ]);
      if (cancelled) return;
      if (zonesRes.data) setCustomZones(zonesRes.data);
      if (placementsRes.data) setPlacements(placementsRes.data);
    }
    void load();

    const channel = supabase
      .channel(`voice-zones-${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "voice_zones", filter: `group_id=eq.${groupId}` },
        (payload: RealtimePostgresChangesPayload<VoiceZone>) => {
          setCustomZones((prev) => applyChange(prev, payload));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "voice_locked_placements", filter: `group_id=eq.${groupId}` },
        (payload: RealtimePostgresChangesPayload<VoiceLockedPlacement>) => {
          setPlacements((prev) => applyChange(prev, payload));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [groupId, supabase]);

  return { customZones, placements };
}

/** Apply a realtime change to a local list using only the payload (no re-query). */
function applyChange<T extends { id: string }>(
  prev: T[],
  payload: RealtimePostgresChangesPayload<T>,
): T[] {
  if (payload.eventType === "INSERT") {
    return [...prev.filter((r) => r.id !== payload.new.id), payload.new];
  }
  if (payload.eventType === "UPDATE") {
    return prev.map((r) => (r.id === payload.new.id ? payload.new : r));
  }
  // DELETE — with REPLICA IDENTITY FULL the old row carries its id.
  const oldId = "id" in payload.old ? payload.old.id : undefined;
  return oldId ? prev.filter((r) => r.id !== oldId) : prev;
}
