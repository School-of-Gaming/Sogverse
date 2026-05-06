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

/**
 * Dashboard panel for moderators to spin up a fresh instant voice room.
 *
 * Single button → POST `/api/voice/instant/create` → navigate to the new
 * room URL. The mod is then in the same `/voice/[code]` page that any
 * participant sees, and they can copy the URL from the header to share.
 *
 * The committing-state pattern (local `creating` flag set synchronously
 * before the fetch and never cleared on success) ensures the button stays
 * disabled across the network round-trip and the route transition. See
 * CLAUDE.md "Loading & Disabled State".
 */
export function CreateInstantRoomCard() {
  const t = useTranslations("voice.instant.createPage");
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      // Don't reset `creating` — the navigation unmounts this view.
      router.push(ROUTES.voice.forCode(code));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("createFailed"));
      setCreating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mic className="h-5 w-5" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={handleCreate}
          disabled={creating}
          size="lg"
          className="gap-2"
        >
          {creating && <Loader2 className="h-4 w-4 animate-spin" />}
          {creating ? t("creating") : t("createButton")}
        </Button>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <div className="space-y-2 rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{t("howItWorksTitle")}</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>{t("howItWorks.share")}</li>
            <li>{t("howItWorks.guests")}</li>
            <li>{t("howItWorks.lifetime")}</li>
            <li>{t("howItWorks.endForEveryone")}</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
