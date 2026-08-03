"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ROUTES } from "@/lib/constants";
import { CreateInstantRoomCardView } from "./CreateInstantRoomCardView";

/**
 * Dashboard panel for moderators to spin up a fresh instant voice room.
 *
 * This is the data half only — the create/join round trips and the router
 * navigation. The markup lives in `CreateInstantRoomCardView`, which takes the
 * whole panel state as props.
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
    <CreateInstantRoomCardView
      createdCode={createdCode}
      creating={creating}
      joining={joining}
      error={error}
      onCreate={() => void handleCreate()}
      onJoin={handleJoin}
    />
  );
}
