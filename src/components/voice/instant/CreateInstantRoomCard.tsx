"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mic, Check, Copy } from "lucide-react";
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
import { cn } from "@/lib/utils";

/**
 * Dashboard panel for moderators to spin up a fresh instant voice room.
 *
 * Two states. Idle: a single centred "Create voice room" button under the
 * heading. After create: the room URL — clicking it copies to clipboard —
 * and a "Join" button that navigates the mod into the room. The mod can
 * paste the URL anywhere (chat, email) before joining.
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
  const [copied, setCopied] = useState(false);
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

  const handleCopy = async () => {
    if (!createdCode || typeof window === "undefined") return;
    const url = `${window.location.origin}${ROUTES.voice.forCode(createdCode)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard write can reject on insecure origins or denied permissions.
      // Silent failure is fine — user can still copy from the address bar
      // after joining.
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
          <RoomLinkDisplay
            code={createdCode}
            copied={copied}
            joining={joining}
            onCopy={handleCopy}
            onJoin={handleJoin}
            shareHint={t("shareHint")}
            copiedLabel={t("copied")}
            joinLabel={t("join")}
          />
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

interface RoomLinkDisplayProps {
  code: string;
  copied: boolean;
  joining: boolean;
  onCopy: () => void;
  onJoin: () => void;
  shareHint: string;
  copiedLabel: string;
  joinLabel: string;
}

/**
 * Post-create state: clickable URL chip + Join button. The URL chip is
 * a real button; clicking copies. We render the protocol-less form for
 * visual cleanliness but copy the full URL with scheme so it pastes as
 * a clickable link.
 */
function RoomLinkDisplay({
  code,
  copied,
  joining,
  onCopy,
  onJoin,
  shareHint,
  copiedLabel,
  joinLabel,
}: RoomLinkDisplayProps) {
  const host =
    typeof window !== "undefined" ? window.location.host : "sogverse.sog.gg";
  const displayUrl = `${host}${ROUTES.voice.forCode(code)}`;

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <button
        type="button"
        onClick={onCopy}
        className={cn(
          "group flex w-full max-w-md items-center justify-center gap-3 rounded-lg border border-border bg-muted/40 px-5 py-4 text-base font-mono font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          copied && "border-success text-success",
        )}
        aria-label={copied ? copiedLabel : displayUrl}
      >
        <span className="truncate">{displayUrl}</span>
        {copied ? (
          <Check className="h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <Copy className="h-4 w-4 shrink-0 opacity-60 group-hover:opacity-100" aria-hidden />
        )}
      </button>
      <p className="text-xs text-muted-foreground">
        {copied ? copiedLabel : shareHint}
      </p>

      <Button
        onClick={onJoin}
        disabled={joining}
        size="lg"
        className="mt-2 gap-2"
      >
        {joining && <Loader2 className="h-4 w-4 animate-spin" />}
        {joinLabel}
      </Button>
    </div>
  );
}
