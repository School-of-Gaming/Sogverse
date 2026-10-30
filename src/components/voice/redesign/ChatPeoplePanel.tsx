"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { ParticipantList } from "../ParticipantList";
import type { VoiceRoomRedesignProps } from "./types";

export type PanelTab = "chat" | "people";

/** Fills the panel's box, which is what the room grants the chat in both layouts. */
const CHAT_HEIGHT = "h-full";

/** Every tab sets one weight, so switching changes no label's width. */
function PanelTabButton({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "rounded-t-md border-b-2 px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act",
        selected
          ? "border-act text-act"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** Chat and People as two tabs. A room with no chat has no tabs to draw. */
export function PanelTabs({
  tab,
  onSelect,
}: {
  tab: PanelTab;
  onSelect: (tab: PanelTab) => void;
}) {
  const t = useTranslations("voice.stage");
  return (
    <div role="tablist" className="flex gap-1">
      <PanelTabButton selected={tab === "chat"} onSelect={() => onSelect("chat")}>
        {t("chat")}
      </PanelTabButton>
      <PanelTabButton selected={tab === "people"} onSelect={() => onSelect("people")}>
        {t("people")}
      </PanelTabButton>
    </div>
  );
}

/**
 * What the tabs show, in a box the layout sizes through `className`.
 *
 * **The chat stays mounted behind the People tab**, so a half-written message,
 * the log's scroll position and the live subscription all survive a look at the
 * people. It sits in an absolutely filled box so `h-full` has a definite height
 * to take, and that box's bottom padding is the line the chat's typing indicator
 * draws into. The chat's root has no height of its own, so the box hands it one.
 */
export function PanelBody({
  tab,
  chat,
  participantChatControls,
  className,
}: Pick<VoiceRoomRedesignProps, "chat" | "participantChatControls"> & {
  tab: PanelTab;
  className: string;
}) {
  const showChat = chat !== undefined && tab === "chat";
  return (
    <div className={cn("relative", className)}>
      {chat !== undefined && (
        <div className={cn("absolute inset-0 px-2 pb-6 pt-2 [&>*]:h-full", !showChat && "hidden")}>
          {chat(CHAT_HEIGHT)}
        </div>
      )}
      <div className={cn("absolute inset-0 overflow-y-auto p-2", showChat && "hidden")}>
        <ParticipantList participantChatControls={participantChatControls} />
      </div>
    </div>
  );
}
