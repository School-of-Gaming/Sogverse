"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { MapPin, MessageSquare, MoreHorizontal, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Heading } from "@sog/ui";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PanelBody, PanelTabs, type PanelTab } from "./ChatPeoplePanel";
import { PhoneZonesSheet } from "./PhoneZonesSheet";
import {
  CameraControl,
  LabelledButton,
  LeaveControl,
  MicCell,
  ModeratorControls,
  useHasControlsBesideShare,
} from "./RoomControls";
import { TileStage } from "./TileStage";
import type { VoiceRoomRedesignProps } from "./types";
import type { RoomStage } from "./use-room-stage";

/** Taller than wide at the most, so the 360px floor's two columns fill a tall stage. */
const TILE_ASPECT = { min: 2 / 3, max: 4 / 3 };
const MIN_TILE_WIDTH = 150;
const CELL = "min-w-0 flex-1";

export type OpenSheet = "zones" | "panel" | "more" | null;

/**
 * The room in a hand: the stage fills the screen between the site header and a
 * bar of big labelled targets, and everything else is a sheet. Which sheet is
 * open is held above, because the header's zone opens the Zones sheet too.
 *
 * **The bar is five cells, or six for a moderator or trainee, which is why Chat
 * and People share one.** At the 360px floor six cells are 55px each and hold a
 * 49px label, so every word on the bar has to fit 49px in every locale: a label
 * wraps between words, and a word that is too long breaks mid-word. Anything
 * added to the bar does that arithmetic again.
 *
 * **The sheets stay mounted while closed**, which is the sheet's own design and
 * what keeps a half-written message and the chat's subscription alive between
 * looks.
 */
export function PhoneRoom({
  stage,
  titleAccessory,
  chat,
  participantChatControls,
  participantShareControls,
  leaveLabel,
  sheet,
  setSheet,
}: VoiceRoomRedesignProps & {
  stage: RoomStage;
  sheet: OpenSheet;
  setSheet: Dispatch<SetStateAction<OpenSheet>>;
}) {
  const t = useTranslations("voice");
  const hasMore = useHasControlsBesideShare();
  const [tab, setTab] = useState<PanelTab>("chat");
  const closeTo = (next: boolean) => {
    if (!next) setSheet(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col pb-[env(safe-area-inset-bottom)]">
      {/* Below the header, because the room code does not fit beside it at 360px. */}
      {titleAccessory && (
        <div className="flex shrink-0 justify-end border-b border-border p-1">
          {titleAccessory}
        </div>
      )}

      <main className="min-h-0 flex-1 p-2">
        <TileStage
          members={stage.stageMembers}
          presenter={stage.presenter}
          bigShare={stage.bigShare}
          otherShares={stage.otherShares}
          onShowShare={stage.showShare}
          shareLayout="below"
          tileAspect={TILE_ASPECT}
          minTileWidth={MIN_TILE_WIDTH}
        />
      </main>

      <nav
        aria-label={t("stage.controls")}
        className="flex shrink-0 gap-1 border-t border-border p-1"
      >
        <MicCell cellClassName={CELL} />
        <CameraControl cellClassName={CELL} />
        <LabelledButton
          icon={<MapPin />}
          label={t("stage.zones")}
          variant="outline"
          aria-haspopup="dialog"
          onClick={() => setSheet("zones")}
          cellClassName={CELL}
        />
        <LabelledButton
          icon={chat !== undefined ? <MessageSquare /> : <Users />}
          label={chat !== undefined ? t("stage.chat") : t("stage.people")}
          variant="outline"
          aria-haspopup="dialog"
          onClick={() => setSheet("panel")}
          cellClassName={CELL}
        />
        {hasMore && (
          <LabelledButton
            icon={<MoreHorizontal />}
            label={t("stage.more")}
            variant="outline"
            aria-haspopup="dialog"
            onClick={() => setSheet("more")}
            cellClassName={CELL}
          />
        )}
        <LeaveControl
          leaving={stage.leaving}
          onLeave={() => void stage.leave()}
          label={leaveLabel}
          cellClassName={CELL}
        />
      </nav>

      <PhoneZonesSheet
        open={sheet === "zones"}
        onOpenChange={closeTo}
        stage={stage}
      />

      <Sheet open={sheet === "panel"} onOpenChange={closeTo} side="bottom">
        <SheetContent>
          {chat !== undefined ? (
            <SheetHeader onClose={() => setSheet(null)} className="items-center px-2 py-1">
              <Heading level={2} step="card-title" srOnly>
                {t("stage.chat")}
              </Heading>
              <PanelTabs tab={tab} onSelect={setTab} />
            </SheetHeader>
          ) : (
            <SheetHeader onClose={() => setSheet(null)}>
              <SheetTitle>{t("stage.people")}</SheetTitle>
            </SheetHeader>
          )}
          <PanelBody
            tab={tab}
            chat={chat}
            participantChatControls={participantChatControls}
            participantShareControls={participantShareControls}
            className="h-[70dvh]"
          />
        </SheetContent>
      </Sheet>

      {hasMore && (
        <Sheet open={sheet === "more"} onOpenChange={closeTo} side="bottom">
          <SheetContent>
            <SheetHeader onClose={() => setSheet(null)}>
              <SheetTitle>{t("stage.more")}</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-2 gap-2 p-4">
              <ModeratorControls omitShare />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
