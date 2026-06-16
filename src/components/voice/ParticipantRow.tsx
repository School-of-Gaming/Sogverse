"use client";

import { type Ref, type ReactNode, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, Lock, LockOpen, MoreVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { MinecraftUsernameBadge } from "@/components/minecraft/minecraft-username-badge";
import { cn } from "@/lib/utils";
import type { VoiceRole } from "./hooks/types";

export interface ParticipantRowData {
  userId: string;
  userName: string;
  role: VoiceRole;
  /**
   * The participant's Minecraft username/UUID (group rooms only). `null` =
   * linked-but-unset → "(Unknown)"; `undefined` = no Minecraft context
   * (instant rooms) → badge hidden. See VoiceParticipant.
   */
  minecraftUsername?: string | null;
  minecraftUuid?: string | null;
  audioOn: boolean;
  videoOn: boolean;
  isLocal: boolean;
  isOwner: boolean;
}

export interface ParticipantRowProps {
  participant: ParticipantRowData;
  lockState: { audio: boolean; video: boolean };
  /** Whether the viewer is a moderator (shows the moderation menu on others' rows). */
  isModView: boolean;
  avatarRef?: Ref<HTMLDivElement>;
  onMute?: (track: "audio" | "video") => void;
  onLock?: (track: "audio" | "video", locked: boolean) => void;
}

export function ParticipantRow({
  participant: p,
  lockState,
  isModView,
  avatarRef,
  onMute,
  onLock,
}: ParticipantRowProps) {
  const t = useTranslations('voice');
  const showModMenu = isModView && !p.isLocal && !p.isOwner;
  // Show the Minecraft badge for gedu/gamer participants, but only when the
  // token actually carried Minecraft context (group rooms). `undefined` ==
  // no context (instant rooms) → hide; `null` == linked-but-unset → render
  // "(Unknown)". See mapParticipant.
  const showMinecraft =
    (p.role === "gamer" || p.role === "gedu") &&
    p.minecraftUsername !== undefined;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border p-2 transition-colors",
        p.isLocal && "bg-accent/50",
      )}
    >
      {/* Avatar */}
      <div ref={avatarRef} className="shrink-0 rounded-md">
        <Avatar className="h-8 w-8">
          <Identicon id={p.userId} size={32} />
        </Avatar>
      </div>

      {/* Name + badges — takes all the flexible width; the name truncates while
          the badges stay intact. The moderation controls no longer sit here, so
          there's nothing to crowd the Minecraft username on a narrow screen. */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm font-medium">
          {p.userName}
          {p.isLocal && (
            <span className="ml-1 text-xs text-muted-foreground">{t('you')}</span>
          )}
        </span>
        {showMinecraft && (
          <MinecraftUsernameBadge
            username={p.minecraftUsername ?? null}
            uuid={p.minecraftUuid ?? null}
            size="sm"
            className="shrink-0"
          />
        )}
      </div>

      {/* Status indicators — always show both icons for stable layout */}
      <div className="flex shrink-0 items-center gap-1.5">
        <div className="relative">
          {p.videoOn ? (
            <Video className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <VideoOff
              className={cn(
                "h-3.5 w-3.5",
                lockState.video ? "text-destructive" : "text-muted-foreground",
              )}
            />
          )}
          {lockState.video && (
            <Lock className="absolute -right-1 -top-1 h-2.5 w-2.5 text-destructive" />
          )}
        </div>
        <div className="relative">
          {p.audioOn ? (
            <Mic className="h-3.5 w-3.5 text-success" />
          ) : (
            <MicOff className="h-3.5 w-3.5 text-destructive" />
          )}
          {lockState.audio && (
            <Lock className="absolute -right-1 -top-1 h-2.5 w-2.5 text-destructive" />
          )}
        </div>
      </div>

      {/* All moderator actions collapse into one overflow menu — a single icon at
          the row's end, so the row layout is identical for every participant and
          nothing spills into the name on mobile. */}
      {showModMenu && (
        <ParticipantModMenu
          name={p.userName}
          audioOn={p.audioOn}
          videoOn={p.videoOn}
          lockState={lockState}
          onMute={onMute}
          onLock={onLock}
        />
      )}
    </div>
  );
}

/**
 * Moderator actions for one participant behind a kebab menu. Collapsing the four
 * controls (mute mic, turn off camera, lock/unlock mic, lock/unlock camera) into
 * a single trigger keeps every participant row the same compact shape on mobile.
 * Hand-rolled popover (no primitive in the kit) — same shape as MicSettingsPopover:
 * click-outside / Escape to close.
 */
function ParticipantModMenu({
  name,
  audioOn,
  videoOn,
  lockState,
  onMute,
  onLock,
}: {
  name: string;
  audioOn: boolean;
  videoOn: boolean;
  lockState: { audio: boolean; video: boolean };
  onMute?: (track: "audio" | "video") => void;
  onLock?: (track: "audio" | "video", locked: boolean) => void;
}) {
  const t = useTranslations("voice");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const run = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => setOpen((v) => !v)}
        title={t("moderate")}
        aria-label={t("moderate")}
        aria-expanded={open}
      >
        <MoreVertical className="h-4 w-4" />
      </Button>

      {/* Opens upward (bottom-full) so that on mobile — where the participant
          list sits at the bottom of the page — the menu never extends past the
          viewport and forces extra scroll height. */}
      {open && (
        <div className="absolute right-0 bottom-full z-50 mb-1 w-52 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg">
          <p className="truncate px-3 py-1.5 text-xs font-medium text-muted-foreground">
            {name}
          </p>
          <MenuItem
            icon={<MicOff className="h-4 w-4" />}
            label={t("muteMicrophone")}
            disabled={!audioOn}
            onClick={() => run(() => onMute?.("audio"))}
          />
          <MenuItem
            icon={<VideoOff className="h-4 w-4" />}
            label={t("disableCamera")}
            disabled={!videoOn}
            onClick={() => run(() => onMute?.("video"))}
          />
          <div className="my-1 h-px bg-border" />
          <MenuItem
            icon={lockState.audio ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            label={lockState.audio ? t("unlockMicrophone") : t("lockMicrophone")}
            active={lockState.audio}
            onClick={() => run(() => onLock?.("audio", !lockState.audio))}
          />
          <MenuItem
            icon={lockState.video ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            label={lockState.video ? t("unlockCamera") : t("lockCamera")}
            active={lockState.video}
            onClick={() => run(() => onLock?.("video", !lockState.video))}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  disabled,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  /** A persistent "on" state (e.g. currently locked) — tinted so it reads as engaged. */
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
        "hover:bg-accent disabled:pointer-events-none disabled:opacity-40",
        active ? "text-destructive" : "text-foreground",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}
