"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
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
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [createFailed, setCreateFailed] = useState(false);
  const [joining, setJoining] = useState(false);

  // Any failure shows the one translated line: the route's refusals and a
  // thrown fetch are English written for a log, and go to the console.
  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    setCreateFailed(false);
    try {
      const response = await fetch("/api/voice/instant/create", {
        method: "POST",
      });
      if (!response.ok) {
        console.error(
          "[instant-voice] create refused:",
          response.status,
          await response.text().catch(() => ""),
        );
        setCreateFailed(true);
        setCreating(false);
        return;
      }
      const { code } = await response.json();
      setCreatedCode(code);
      setCreating(false);
    } catch (err) {
      console.error("[instant-voice] create failed:", err);
      setCreateFailed(true);
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
      createFailed={createFailed}
      onCreate={() => void handleCreate()}
      onJoin={handleJoin}
    />
  );
}
