"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Heading } from "@sog/ui";
import { Header } from "@/components/layout";
import { DesktopRoom } from "./DesktopRoom";
import { PhoneRoom, type OpenSheet } from "./PhoneRoom";
import type { VoiceRoomRedesignProps } from "./types";
import { useRoomStage, type RoomStage } from "./use-room-stage";
import { useIsDesktopStage } from "./use-stage-layout";
import { ZoneGlyph } from "./ZoneEntry";

const ZONE_ROW = "flex min-w-0 items-center gap-1.5 overflow-hidden";

/**
 * The redesigned in-session room: the zone you are in is the stage.
 *
 * Draft body, previewed in the `voice-room-redesign` scene. It takes `VoiceRoom`'s
 * props and reads the same context, and it renders the site header itself: what
 * the header's slot holds is only known in here, so the promotion that replaces
 * `VoiceRoom` takes the header out of the route's layout for the joined room.
 *
 * Two native layouts over one context rather than one responsive layout, because
 * a stage beside two panels and a stage under a thumb share no structure. Exactly
 * one is ever mounted (see {@link useIsDesktopStage}), so crossing the breakpoint
 * remounts the chat and the tiles. What must survive that lives above it, in
 * {@link useRoomStage}.
 *
 * The header is a child of a column one viewport tall, so the layouts take what it
 * leaves without restating its height.
 */
export function VoiceRoomRedesign(props: VoiceRoomRedesignProps) {
  const t = useTranslations("voice");
  const stage = useRoomStage(props.onLeave, props.presenterSessionId ?? null);
  const isDesktop = useIsDesktopStage();
  const [sheet, setSheet] = useState<OpenSheet>(null);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <Heading level={1} step="card-title" srOnly>
        {props.title ?? t("voiceRoom")}
      </Heading>
      <Header
        navSlot={
          <CurrentZone
            stage={stage}
            accessory={isDesktop === true ? props.titleAccessory : undefined}
            onOpenZones={isDesktop === false ? () => setSheet("zones") : undefined}
          />
        }
      />
      {isDesktop === true && <DesktopRoom {...props} stage={stage} />}
      {isDesktop === false && (
        <PhoneRoom {...props} stage={stage} sheet={sheet} setSheet={setSheet} />
      )}
    </div>
  );
}

/**
 * Where the nav links would be: the zone's mark and its name, which is what
 * gives way when the strip runs out (the measured table in `header.tsx`).
 */
function CurrentZone({
  stage,
  accessory,
  onOpenZones,
}: {
  stage: RoomStage;
  accessory?: ReactNode;
  /** Absent on a wide screen, where the zones are already on the page. */
  onOpenZones?: () => void;
}) {
  const zone = (
    <>
      {stage.currentZone && <ZoneGlyph zone={stage.currentZone} />}
      <span className="truncate text-sm font-medium">{stage.currentZoneName}</span>
    </>
  );

  return (
    <div className="flex min-w-0 items-center gap-2">
      {onOpenZones ? (
        <button
          type="button"
          onClick={onOpenZones}
          aria-haspopup="dialog"
          className={`${ZONE_ROW} min-h-11 rounded-md text-left hover:text-act focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act`}
        >
          {zone}
        </button>
      ) : (
        <div className={ZONE_ROW}>{zone}</div>
      )}
      {accessory}
    </div>
  );
}
