"use client";

import { useVoiceRoom } from "./VoiceRoomProvider";
import { Zone } from "./Zone";
import { DraggableAvatar } from "./DraggableAvatar";
import { ZONE_RECTS } from "@/lib/constants/spatial";

export function SpatialCanvas() {
  const { participants, positions, localZone, localRole } = useVoiceRoom();

  return (
    <div className="relative w-full overflow-hidden rounded-lg border bg-card" style={{ aspectRatio: "4 / 3" }}>
      {/* Zones */}
      {ZONE_RECTS.map((zone) => (
        <Zone key={zone.id} zone={zone} isActive={localZone === zone.id} />
      ))}

      {/* Participant avatars */}
      {participants.map((p) => {
        const canDrag =
          p.isLocal || localRole === "admin" || localRole === "gedu";

        return (
          <DraggableAvatar
            key={p.sessionId}
            participant={p}
            position={positions.get(p.sessionId)}
            canDrag={canDrag}
          />
        );
      })}
    </div>
  );
}
