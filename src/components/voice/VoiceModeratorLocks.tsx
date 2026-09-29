"use client";

import { createContext, useContext, useMemo } from "react";
import { useTranslations } from "next-intl";
import type { LockExplanation } from "@/components/ui/locked-control";
import type { ChatModerationLocks } from "@/components/chat";

/**
 * The moderator controls a room shows a viewer **locked** — each one's words —
 * supplied by the page that mounted the room.
 *
 * A trainee is in the room with a participant's powers, and sees the room an
 * assigned gedu sees: the same screen-share, broadcast and deafen buttons, the
 * same zone controls, the same menu on a participant's row — each carrying a
 * padlock and explaining itself when pressed.
 *
 * **Supplied, never inferred.** The room's components never learn who is
 * looking: a viewer whose token is an owner's gets working controls, a viewer
 * handed this value gets the same controls locked, and anyone else gets neither.
 * The page is what knows the viewer holds a trainee seat — the token route says
 * so in its response — exactly as it is what knows the viewer has staff sight
 * for the member flair.
 *
 * `null` is the resting state and the default, which is what a family's room
 * and an instant room get.
 */
export interface VoiceModeratorLocks {
  screenShare: LockExplanation;
  broadcast: LockExplanation;
  deafen: LockExplanation;
  zones: LockExplanation;
  /** The participant row's moderation menu — mute, lock, chat lock. */
  moderate: LockExplanation;
}

const VoiceModeratorLocksContext = createContext<VoiceModeratorLocks | null>(
  null,
);

export const VoiceModeratorLocksProvider = VoiceModeratorLocksContext.Provider;

/** The locks this viewer is shown, or `null` for none. */
export function useVoiceModeratorLocks(): VoiceModeratorLocks | null {
  return useContext(VoiceModeratorLocksContext);
}

/**
 * A trainee's locks for the room and for its chat, in the trainee's words: what
 * each control does, then that it is the assigned Gedus' to use.
 *
 * One hook for both surfaces because they are one room to the trainee, and the
 * page that mounts it is where both are handed out.
 */
export function useTraineeRoomLocks(): {
  voice: VoiceModeratorLocks;
  chat: ChatModerationLocks;
} {
  const t = useTranslations("gedu.trainee");
  return useMemo(() => {
    const explain = (title: string, what: string): LockExplanation => ({
      title,
      what,
      why: t("whyAction"),
      dismiss: t("dismiss"),
      lockedHint: t("lockedHint"),
    });
    return {
      voice: {
        screenShare: explain(t("screenShareTitle"), t("screenShareWhat")),
        broadcast: explain(t("broadcastTitle"), t("broadcastWhat")),
        deafen: explain(t("deafenTitle"), t("deafenWhat")),
        zones: explain(t("zonesTitle"), t("zonesWhat")),
        moderate: explain(t("moderateTitle"), t("moderateWhat")),
      },
      chat: {
        hide: explain(t("chatHideTitle"), t("chatHideWhat")),
        restore: explain(t("chatRestoreTitle"), t("chatRestoreWhat")),
        lock: explain(t("chatLockTitle"), t("chatLockWhat")),
      },
    };
  }, [t]);
}
