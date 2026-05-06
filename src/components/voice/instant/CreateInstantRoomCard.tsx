"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { ROUTES } from "@/lib/constants";
import { RoomLinkChip } from "./RoomLinkChip";

/**
 * Dashboard panel for moderators to spin up a fresh instant voice room.
 *
 * Two states. Idle: a single centred "Create voice room" button under the
 * heading. After create: the shared `RoomLinkChip` (click to copy) and a
 * "Join" button that navigates the mod into the room. The mod can paste
 * the URL anywhere (chat, email) before joining.
 *
 * The committing-state pattern (local `creating` flag set synchronously
 * before the fetch and never cleared on success) ensures the button stays
 * disabled across the network round-trip. See CLAUDE.md "Loading & Disabled
 * State".
 */
export function CreateInstantRoomCard() {
  const t = useTranslations("voice.instant.createPage");
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/voice/instant/create", {
        method: "POST",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : t("createFailed"));
        setCreating(false);
        return;
      }
      const { code } = await response.json();
      setCreatedCode(code);
      setCreating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("createFailed"));
      setCreating(false);
    }
  };

  const handleJoin = () => {
    if (!createdCode || joining) return;
    setJoining(true);
    // Don't reset `joining` — the navigation unmounts this view.
    router.push(ROUTES.voice.forCode(createdCode));
  };

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
              onClick={handleJoin}
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
            onClick={handleCreate}
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
