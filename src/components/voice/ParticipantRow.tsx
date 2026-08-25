"use client";

import { type Ref, type ReactNode, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, Lock, LockOpen, MoreVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Identicon } from "@/components/ui/identicon";
import {
  GameUsernameRow,
  type GameAccountExternalId,
  type GamePlatform,
} from "@/components/game-account";
import { NewcomerBadge, GamerNoteDot } from "@/components/member-flair";
import { ROLE_BADGE_STYLES, ROLE_LABEL_KEYS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { VoiceRole } from "./hooks/types";

export interface ParticipantRowData {
  userId: string;
  userName: string;
  role: VoiceRole;
  /**
   * The participant's game identity, as the room's product decided it. `null`
   * username = linked-but-unset → "(Unknown)"; an absent platform = no game
   * context (an instant room, or a topic about no single game account) → the
   * identity row is hidden entirely. See VoiceParticipant.
   */
  gamePlatform?: GamePlatform;
  gameUsername?: string | null;
  gameExternalId?: GameAccountExternalId | null;
  /**
   * The figure's URL, with the row's three meanings intact: a string draws that
   * render, `null` draws the placeholder without going looking, and omitting it
   * lets the platform derive one from the name — which only Minecraft can do.
   *
   * **A Roblox row must always be handed one of the first two.** Its renders
   * come from a batched by-id lookup that only a *list* may run, so whoever
   * renders the list resolves them and passes each row its answer; the row
   * itself never fetches. See ParticipantList.
   */
  gameAvatarUrl?: string | null;
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

  /* ---- Staff-only overlay ------------------------------------------------
     The member flair below is *not* participant identity, which is why it sits
     here rather than in ParticipantRowData: everything in that shape arrives
     over the Daily token's `user_name`, which Daily broadcasts to every peer in
     the room — children included. These facts are the opposite kind of thing.
     A group join stamp and the existence of a private Gedu note are staff
     working memory, and they reach the client through a staff-scoped fetch a
     family's client never makes and RLS would refuse it anyway.

     **So they must never ride the token.** Putting a join date or a note flag
     into `user_name` would hand both to every gamer in the call, permanently,
     for the life of the token — a leak no client-side gate could take back.
     Keeping them as separate props on the *props* (a viewer-dependent overlay,
     resolved by whoever renders the list) rather than on the participant makes
     that boundary structural: a row assembled from a token simply has nothing
     to pass, and the flair renders as absence.

     Absence is the resting state throughout — every one of these is optional,
     and with `onOpenNote` omitted the row renders exactly as it did before the
     overlay existed. */

  /**
   * The member's `group_joined_at`, for the fading newcomer badge. `null` (or
   * omitted) draws nothing, as does a stamp past the newcomer window.
   */
  newcomerJoinedAt?: string | null;
  /**
   * The clock the badge's fade is measured against — the caller's, so a room
   * full of rows agrees with the page around it instead of each row reading its
   * own `new Date()`. Only consulted when `newcomerJoinedAt` is set.
   */
  flairNow?: Date;
  /** Whether a Gedu note exists for this member in this group. */
  hasNote?: boolean;
  /**
   * Opens the note dialog. Its presence is what makes the avatar a control at
   * all: a viewer with no note access passes nothing and gets today's plain
   * avatar, with no button semantics for a screen reader to announce.
   */
  onOpenNote?: () => void;
}

export function ParticipantRow({
  participant: p,
  lockState,
  isModView,
  avatarRef,
  onMute,
  onLock,
  newcomerJoinedAt,
  flairNow,
  hasNote,
  onOpenNote,
}: ParticipantRowProps) {
  const c = useTranslations("common");
  const f = useTranslations("memberFlair");
  const showModMenu = isModView && !p.isLocal && !p.isOwner;
  // Show the game identity for gedu/gamer participants, but only when the token
  // actually carried a platform. An absent platform == no game context (an
  // instant room, or a product whose topic is about no single game account) →
  // hide the slot; a `null` username == linked-but-unset → render "(Unknown)".
  // Narrowed into a local so the platform is a value the row can pass, not just
  // a condition it tested. See mapParticipant.
  const gamePlatform: GamePlatform | undefined =
    p.role === "gamer" || p.role === "gedu" ? p.gamePlatform : undefined;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border p-2 transition-colors",
        p.isLocal && "bg-accent/50",
      )}
    >
      {/* Avatar — the ref div stays the outermost element whatever the note
          affordance does, because the speaking glow writes box-shadow and
          border-color straight onto it every animation frame. Wrapping *it*
          would move the glow off the face; the button goes inside, around the
          Avatar, and carries the accessible name for the dot (which is
          decorative). Same size and geometry either way, so a viewer with note
          access and one without see rows of identical shape. */}
      <div ref={avatarRef} className="shrink-0 rounded-md">
        {onOpenNote ? (
          <button
            type="button"
            onClick={onOpenNote}
            aria-label={f("openNote", { name: p.userName })}
            className="relative block rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Avatar className="h-8 w-8">
              <Identicon id={p.userId} size={32} />
            </Avatar>
            {hasNote && <GamerNoteDot />}
          </button>
        ) : (
          <Avatar className="h-8 w-8">
            <Identicon id={p.userId} size={32} />
          </Avatar>
        )}
      </div>

      {/* Name + identity — takes all the flexible width; the name truncates
          while the identity slot keeps its fixed geometry. The moderation
          controls no longer sit here, so there's nothing to crowd the username
          on a narrow screen. The identity slot follows the adult-variant
          grammar the rosters established: a child-shaped fact for children
          (the game account), the Parent badge for a parent on their own seat —
          the same slot answers "who is this" either way. */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm font-medium">
          {p.userName}
        </span>
        {/* Directly after the name, before the identity slot: the badge is a
            fact about the person, and it is `shrink-0`, so the name goes on
            surrendering width to truncation first — exactly as it already does
            beside the identity slot and the Parent badge. Those two are
            mutually exclusive by role and this one is orthogonal to both, so a
            parent's row can carry it too; a room does not gain a wider slot
            when a newcomer joins it. */}
        {newcomerJoinedAt != null && flairNow !== undefined && (
          <NewcomerBadge joinedAt={newcomerJoinedAt} now={flairNow} />
        )}
        {gamePlatform && (
          <GameUsernameRow
            platform={gamePlatform}
            username={p.gameUsername ?? null}
            externalId={p.gameExternalId ?? null}
            avatarUrl={p.gameAvatarUrl}
            // The compact figure. A participant list is dense by nature and the
            // full body made every row half again as tall while outweighing the
            // identicon beside it — the face carries the same identity at the
            // identicon's own size. It is also square on both platforms, so the
            // slot's geometry does not move when the room's platform changes.
            figure="head"
            className="w-40 shrink-0"
          />
        )}
        {p.role === "customer" && (
          /* The same badge and word the roster row and admin chips draw for a
             customer, read off the shared role constants. Rendered inside a
             flex div — a Badge is a div, and this exact badge inside a <p>
             was a hydration failure once already. */
          <Badge
            className={cn(
              ROLE_BADGE_STYLES.customer,
              "shrink-0 px-1.5 py-0 text-[10px] font-normal",
            )}
          >
            {c(ROLE_LABEL_KEYS.customer)}
          </Badge>
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
