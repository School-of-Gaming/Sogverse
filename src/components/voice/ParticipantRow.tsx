"use client";

import { type Ref, type ReactNode, useEffect, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Lock,
  LockOpen,
  MoreVertical,
} from "lucide-react";
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
import { GamerFlairButton, NewcomerBadge } from "@/components/member-flair";
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

/**
 * The chat lock this viewer is offered against one person, handed to the row
 * ready to render.
 *
 * **The row is told, never asked to work it out.** Who may lock whom is chat's
 * own question — a positive allow-list of moderator roles, no lock against a
 * colleague or yourself, and nobody who is not on the channel's roster — and it
 * is answered in one place (`deriveChatLockControl` in `components/chat`) so
 * that a message's menu and this rail cannot come to two different conclusions
 * about the same person. What crosses into this directory is the conclusion:
 * which way the switch points, and what to call when it is pressed.
 *
 * The literal union rather than chat's own type, deliberately: a row that
 * imported a chat type would be a voice component that knows there is a chat.
 * It knows there is a lock with two directions, which is all it draws.
 */
export interface ParticipantChatControl {
  /** Which way the switch points — what pressing it would do. */
  direction: "lock" | "unlock";
  onSetLock: (locked: boolean) => void;
}

/**
 * The room's per-participant chat controls, as one function of a user id.
 *
 * `null` for anybody the viewer is offered nothing against, which is the resting
 * state: a room with no chat at all (an instant room) passes no function, and a
 * viewer who does not moderate gets `null` for everyone.
 */
export type ParticipantChatControls = (
  userId: string,
) => ParticipantChatControl | null;

export interface ParticipantRowProps {
  participant: ParticipantRowData;
  lockState: { audio: boolean; video: boolean };
  /** Whether the viewer is a moderator (shows the moderation menu on others' rows). */
  isModView: boolean;
  avatarRef?: Ref<HTMLDivElement>;
  onMute?: (track: "audio" | "video") => void;
  onLock?: (track: "audio" | "video", locked: boolean) => void;
  /**
   * The chat lock offered against this person, or `null`/omitted for none.
   *
   * It sits beside the mic and camera locks in the moderation menu because a
   * moderator watching a room should not have to hunt the log for something a
   * child wrote in order to lift a lock they placed. Absent by default: an
   * instant room has no chat, and a viewer who does not moderate is offered
   * nothing.
   */
  chatControl?: ParticipantChatControl | null;

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
     and with `onOpenFlair` omitted the row renders exactly as it did before the
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
  /**
   * Whether anything has been recorded about this member in this group — a Gedu
   * note, a creation, or both.
   */
  hasContent?: boolean;
  /**
   * Opens the per-gamer dialog. Its presence is what puts the button at the end
   * of the row: a viewer with no staff access passes nothing and the row has no
   * trailing control for a screen reader to announce.
   */
  onOpenFlair?: () => void;
}

export function ParticipantRow({
  participant: p,
  lockState,
  isModView,
  avatarRef,
  onMute,
  onLock,
  chatControl,
  newcomerJoinedAt,
  flairNow,
  hasContent,
  onOpenFlair,
}: ParticipantRowProps) {
  const c = useTranslations("common");
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
        // One wrapping line, not a row of nested columns. Everything on the row
        // is a direct child so that `order` can put the game identity in two
        // different places at two widths (see the identity slot below), which
        // no amount of nesting can do.
        "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border p-2 transition-colors sm:gap-x-3",
        p.isLocal && "bg-accent/50",
      )}
    >
      {/* Avatar — the ref div is the element the speaking glow writes box-shadow
          and border-color onto every animation frame, so nothing may wrap it:
          wrapping would move the glow off the face. */}
      <div ref={avatarRef} className="order-1 shrink-0 rounded-md">
        <Avatar className="h-8 w-8">
          <Identicon id={p.userId} size={32} />
        </Avatar>
      </div>

      {/* The name — the one thing on this row allowed to truncate, and the
          *only* one: everything beside it is `shrink-0`, so a long name gives
          way rather than abbreviating a game account or clipping a badge.

          **`flex-1` paired with `max-w-fit` is what makes that true in a
          wrapping row, and neither half works alone.** A wrapping flex
          container decides its line breaks from each item's *hypothetical*
          size — before any shrinking — and `truncate` sets `white-space:
          nowrap`, so a plain truncating name contributes its full text width to
          that decision and pushes the trailing controls onto a second line
          instead of giving way. `flex-1` sets the basis to zero, so the name
          contributes nothing to line-breaking and absorbs slack afterwards;
          `max-w-fit` then caps that growth at the name's own width, so it never
          takes more room than it needs and the identity still sits directly
          against it rather than being flung to the far edge of a wide row. */}
      <span className="order-2 min-w-0 max-w-fit flex-1 truncate text-sm font-medium">
        {p.userName}
      </span>

      {/* The game identity — **the one item that moves between breakpoints.**
          From `sm` up it sits directly after the name, sized to its own
          content; below `sm` it takes a line of its own under everything else,
          indented past the avatar.

          Two rules force that. A game account is never abbreviated, so this
          slot is `shrink-0` and has no fixed width — a fixed 160px column both
          clipped the long names and left a dead gap after the short ones. And
          the newcomer badge belongs beside the *name* on a phone, not adrift on
          a line of its own, which rules out simply stacking the row into two
          halves. A single wrapping line with `order` gives both: on a phone the
          full-width identity is the last item and wraps below, while the name
          and its badges stay together on the first line. The 360px arithmetic
          this answers is in ./CLAUDE.md. */}
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
          // Nothing on this row is ever checked — the identity arrives on the
          // Daily token and cannot change while the room is open — so the
          // trailing status square would be an empty box held open between the
          // username and the newcomer badge for a spinner that can never run.
          statusSlot="collapsed"
          className="order-7 w-full shrink-0 pl-11 sm:order-3 sm:w-auto sm:pl-0"
        />
      )}

      {/* The Parent badge, then the newcomer badge — in that order, and the
          order is what makes the row safe rather than merely tidy.

          The Parent badge is painted from the Daily token the instant the room
          is; the newcomer badge arrives with the staff overlay a round trip
          later. **Anything that lands late has to land at the end of the run**,
          where its arrival is absorbed by the row's slack instead of displacing
          something already on screen — the same reason the note button sits at
          the left edge of the right-packed trailing group below. Put the
          newcomer badge ahead of the Parent badge and the overlay shoves an
          adult's role badge sideways every time it resolves.

          Both are `shrink-0`, so the name goes on surrendering width to
          truncation first and a room does not gain a wider slot when a newcomer
          joins it. The identity slot and the Parent badge are mutually
          exclusive by role and the newcomer badge is orthogonal to both, so an
          adult's row can carry it too.

          **No wrapping div, deliberately.** A group would have to decide
          whether it renders at all, and the only honest answer depends on
          whether the badge is inside its 30-day window — which is the badge's
          own arithmetic, not this row's. Left as direct children, a badge that
          renders `null` is simply not a flex item and costs nothing; a group
          would have cost a gap on either side of itself for a stamp that had
          quietly expired. */}
      {p.role === "customer" && (
        /* The same badge and word the roster row and admin chips draw for a
           customer, read off the shared role constants. Rendered inside a
           flex div — a Badge is a div, and this exact badge inside a <p>
           was a hydration failure once already. */
        <Badge
          className={cn(
            ROLE_BADGE_STYLES.customer,
            "order-3 shrink-0 px-1.5 py-0 text-[10px] font-normal sm:order-4",
          )}
        >
          {c(ROLE_LABEL_KEYS.customer)}
        </Badge>
      )}
      {newcomerJoinedAt != null && flairNow !== undefined && (
        <NewcomerBadge
          joinedAt={newcomerJoinedAt}
          now={flairNow}
          className="order-3 sm:order-4"
        />
      )}

      {/* The row's trailing controls, as **one right-packed group**, and both
          halves of that are load-bearing.

          *Right-packed*, because the group carries the row's slack (`ml-auto`)
          and is the last thing on the line: its right edge is the row's right
          edge, and its contents pack leftward from there. So a control that
          appears later — the note button, which arrives with the staff overlay
          a round trip after the room paints — grows the group leftward into
          slack rather than displacing what is already on screen. The icons and
          the menu keep their positions to the pixel.

          *One group*, because that only holds while the note button sits to the
          **left** of the icons. Between them (where it first sat) it pushed the
          mic and camera left by its own width on every row, every time the
          overlay landed — an already-painted element moving on data's own
          schedule, which is exactly what the layout rule forbids. Keeping the
          three in one always-present group is also what lets the slack live in
          one fixed place: parking it on a conditional control would mean the
          row had no sink at all on the rows that lack it. */}
      <div className="order-4 ml-auto flex shrink-0 items-center gap-2 sm:order-5">
        {onOpenFlair && (
          <GamerFlairButton
            name={p.userName}
            hasContent={hasContent === true}
            onOpen={onOpenFlair}
          />
        )}

        {/* Status indicators — always show both icons for stable layout. */}
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="relative">
            {p.videoOn ? (
              <Video className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <VideoOff
                className={cn(
                  "h-3.5 w-3.5",
                  lockState.video
                    ? "text-destructive"
                    : "text-muted-foreground",
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

        {/* All moderator actions collapse into one overflow menu — a single icon
            at the row's end, so the row layout is identical for every
            participant and nothing spills into the name on mobile. */}
        {showModMenu && (
          <ParticipantModMenu
            name={p.userName}
            audioOn={p.audioOn}
            videoOn={p.videoOn}
            lockState={lockState}
            onMute={onMute}
            onLock={onLock}
            chatControl={chatControl}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Moderator actions for one participant behind a kebab menu. Collapsing the
 * controls (mute mic, turn off camera, lock/unlock mic, lock/unlock camera, and
 * — where the room has a chat — lock/unlock chat) into a single trigger keeps
 * every participant row the same compact shape on mobile. Hand-rolled popover
 * (no primitive in the kit) — same shape as MicSettingsPopover: click-outside /
 * Escape to close.
 *
 * **The lock group is one group, and the chat lock is the last of it.** Mic,
 * camera and chat are the three things that can be taken away from a person
 * here, so they read as a set under one divider — and the chat lock goes last
 * because it is the only one of the three that can be absent, so its presence
 * or absence never reorders the two above it.
 *
 * **The menu grows upward from the trigger, so nothing may be added to it while
 * it is open**: a fourth item appearing would push the three already on screen
 * up, under a hand that is reaching for one of them. Nothing does — a menu
 * opening is a user action, and what it holds at that moment is settled long
 * before, because the chat panel above the rail resolved its history when the
 * room did. Anything added here later has to keep that true rather than rely on
 * where in the list it sits.
 */
function ParticipantModMenu({
  className,
  name,
  audioOn,
  videoOn,
  lockState,
  onMute,
  onLock,
  chatControl,
}: {
  /** Where the menu sits in the row's wrapping order. */
  className?: string;
  name: string;
  audioOn: boolean;
  videoOn: boolean;
  lockState: { audio: boolean; video: boolean };
  onMute?: (track: "audio" | "video") => void;
  onLock?: (track: "audio" | "video", locked: boolean) => void;
  /** The chat lock, already decided by the chat surface. See the row's props. */
  chatControl?: ParticipantChatControl | null;
}) {
  const t = useTranslations("voice");
  // Chat's own namespace for chat's own act, rather than a copy under `voice.*`
  // — one place owns the vocabulary a lock is described in. The label is the
  // short, name-less form: this menu already carries the person's name at its
  // head and every sibling item is a bare imperative, where a message's menu has
  // no header and so names the person in the sentence.
  const m = useTranslations("chat.moderation");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (
        ref.current &&
        e.target instanceof Node &&
        !ref.current.contains(e.target)
      ) {
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
    <div ref={ref} className={cn("relative shrink-0", className)}>
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
            icon={
              lockState.audio ? (
                <LockOpen className="h-4 w-4" />
              ) : (
                <Lock className="h-4 w-4" />
              )
            }
            label={
              lockState.audio ? t("unlockMicrophone") : t("lockMicrophone")
            }
            active={lockState.audio}
            onClick={() => run(() => onLock?.("audio", !lockState.audio))}
          />
          <MenuItem
            icon={
              lockState.video ? (
                <LockOpen className="h-4 w-4" />
              ) : (
                <Lock className="h-4 w-4" />
              )
            }
            label={lockState.video ? t("unlockCamera") : t("lockCamera")}
            active={lockState.video}
            onClick={() => run(() => onLock?.("video", !lockState.video))}
          />
          {chatControl != null && (
            <MenuItem
              icon={
                chatControl.direction === "unlock" ? (
                  <LockOpen className="h-4 w-4" />
                ) : (
                  <Lock className="h-4 w-4" />
                )
              }
              label={
                chatControl.direction === "unlock"
                  ? m("unlockChat")
                  : m("lockChat")
              }
              // Tinted while the lock stands, exactly as the mic and camera
              // locks are: "unlock" is offered only to somebody who is locked.
              active={chatControl.direction === "unlock"}
              onClick={() =>
                run(() =>
                  chatControl.onSetLock(chatControl.direction === "lock"),
                )
              }
            />
          )}
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
