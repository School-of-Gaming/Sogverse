"use client";

import { useState } from "react";
import { MapPin, MessageSquare, MoreHorizontal, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Heading } from "@sog/ui";
import { LogoBadge } from "@/components/layout/logo-badge";
import { SENDER_NAME } from "@/lib/constants/brand";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PanelBody, PanelTabs, type PanelTab } from "./ChatPeoplePanel";
import { PhoneZonesSheet } from "./PhoneZonesSheet";
import { RoomAccount } from "./RoomAccount";
import {
  CameraControl,
  LabelledButton,
  LeaveControl,
  MicCell,
  ModeratorControls,
  useHasModeratorControls,
} from "./RoomControls";
import { TileStage } from "./TileStage";
import type { VoiceRoomRedesignProps } from "./types";
import type { RoomStage } from "./use-room-stage";
import { ZoneGlyph } from "./ZoneEntry";

/** Taller than wide at the most, so the 360px floor's two columns fill a tall stage. */
const TILE_ASPECT = { min: 2 / 3, max: 4 / 3 };
const MIN_TILE_WIDTH = 150;
const CELL = "min-w-0 flex-1";

type OpenSheet = "zones" | "panel" | "more" | null;

/**
 * The room in a hand: the stage fills the screen between a strip saying where
 * you are and a bar of big labelled targets, and everything else is a sheet.
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
  title,
  titleAccessory,
  chat,
  participantChatControls,
  participantShareControls,
  shareLocked,
  leaveLabel,
}: VoiceRoomRedesignProps & { stage: RoomStage }) {
  const t = useTranslations("voice");
  const hasMore = useHasModeratorControls();
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [tab, setTab] = useState<PanelTab>("chat");
  const closeTo = (next: boolean) => {
    if (!next) setSheet(null);
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <Heading level={1} step="card-title" srOnly>
        {title ?? t("voiceRoom")}
      </Heading>

      <header className="flex shrink-0 items-center gap-2 border-b border-border px-1 py-0.5">
        {/* Not a link: leaving for the home page would drop the call. The badge
            alone, because at 360px the wordmark's 123px is the zone name's room. */}
        <LogoBadge alt={SENDER_NAME} className="h-6 w-auto shrink-0" />
        <button
          type="button"
          onClick={() => setSheet("zones")}
          aria-haspopup="dialog"
          className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-1 text-left hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act"
        >
          {stage.currentZone && <ZoneGlyph zone={stage.currentZone} />}
          <span className="truncate text-sm font-medium">{stage.currentZoneName}</span>
        </button>
        {titleAccessory}
        <RoomAccount />
      </header>

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
            <div className="grid grid-cols-3 gap-2 p-4">
              <ModeratorControls shareLocked={shareLocked} />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
