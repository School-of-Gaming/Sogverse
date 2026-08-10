"use client";

import { Loader2, Mic } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RoomLinkChip } from "./RoomLinkChip";

export interface CreateInstantRoomCardViewProps {
  /** Room code once one has been created; `null` is the idle state. */
  createdCode: string | null;
  /** Create is in flight — the button stays disabled and spins. */
  creating: boolean;
  /** Join is in flight — the navigation is under way. */
  joining: boolean;
  /** Already-translated failure message, or `null`. */
  error: string | null;
  onCreate: () => void;
  onJoin: () => void;
}

/**
 * Presentational core of the instant-voice-room dashboard panel.
 *
 * Two states. Idle: a single centred "Create voice room" button under the
 * heading. After create: the shared `RoomLinkChip` (click to copy) and a
 * "Join" button that navigates the mod into the room. The mod can paste
 * the URL anywhere (chat, email) before joining.
 *
 * It owns no fetch, no router and no state, so a full-page preview scene can
 * render the section looking exactly like the real thing with both actions
 * inert.
 */
export function CreateInstantRoomCardView({
  createdCode,
  creating,
  joining,
  error,
  onCreate,
  onJoin,
}: CreateInstantRoomCardViewProps) {
  const t = useTranslations("voice.instant.createPage");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mic className="h-5 w-5" />
          {createdCode ? t("ready") : t("title")}
        </CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center gap-4 py-10">
        {createdCode ? (
          <>
            <RoomLinkChip code={createdCode} />
            <Button
              onClick={onJoin}
              disabled={joining}
              size="lg"
              className="mt-2 gap-2"
            >
              {joining && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("join")}
            </Button>
          </>
        ) : (
          <Button
            onClick={onCreate}
            disabled={creating}
            size="lg"
            className="gap-2"
          >
            {creating && <Loader2 className="h-4 w-4 animate-spin" />}
            {creating ? t("creating") : t("createButton")}
          </Button>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
