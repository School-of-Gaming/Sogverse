import { useTranslations } from "next-intl";
import { useVoiceRoom } from "../VoiceRoomProvider";
import type { RoomStage } from "./use-room-stage";

/**
 * Who hears the reader, in plain words. A muted reader is told that instead of
 * a count, because "6 people can hear you" over a muted mic is false, and it is
 * the first thing a first-timer needs to know.
 */
export function useHearStatus(stage: RoomStage): string {
  const t = useTranslations("voice.stage");
  const { micOn } = useVoiceRoom();
  return micOn ? t("hearYou", { count: stage.hearCount }) : t("micOffStatus");
}
