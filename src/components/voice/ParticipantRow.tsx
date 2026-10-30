"use client";

import {
  type CSSProperties,
  type Ref,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Lock,
  LockOpen,
  MoreVertical,
  ScreenShareOff,
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
import {
  LockedButton,
  type LockExplanation,
} from "@/components/ui/locked-control";
import { ROLE_BADGE_STYLES, ROLE_LABEL_KEYS } from "@/lib/constants/roles";
import { cn } from "@/lib/cn";
import type { VoiceParticipant, VoiceRole } from "./hooks/types";

/** The live row's identity slot, whose placement ./CLAUDE.md explains. */
const LIVE_IDENTITY_SLOT =
  "order-7 w-full shrink-0 pl-11 sm:order-3 sm:w-auto sm:pl-0";
const LIVE_BADGE_ORDER = "order-3 sm:order-4";
const PANEL_IDENTITY_SLOT = "shrink-0";
/** A late mark on the panel row's first line, after the name. */
const PANEL_FIRST_LINE = "order-1";

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
 * own question — a viewer who moderates by the server's answer, no lock against a
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

/**
 * The screen-share moderation offered against one person, handed to the row ready
 * to render. Absent on a live row: the live context has no such actions yet.
 */
export interface ParticipantShareControl {
  /** Whether they are sharing now, which is what offers the one-shot stop. */
  sharing: boolean;
  locked: boolean;
  onStop: () => void;
  onSetLock: (locked: boolean) => void;
}

export type ParticipantShareControls = (
  participant: VoiceParticipant,
) => ParticipantShareControl;

export interface ParticipantRowProps {
  participant: ParticipantRowData;
  lockState: { audio: boolean; video: boolean };
  /** Whether the viewer is a moderator (shows the moderation menu on others' rows). */
  isModView: boolean;
  /**
   * The moderation menu's lock, for a viewer shown the menu locked (a
   * trainee): the same trigger on the same rows, explaining itself when
   * pressed instead of opening. Ignored for a moderator.
   */
  moderationLock?: LockExplanation | null;
  /**
   * The element the speaking glow writes its inline style onto every animation
   * frame: the avatar, or the mic in the panel layout.
   */
  glowRef?: Ref<HTMLDivElement>;
  /**
   * The rows' shape. Omitted is the room's own full-width list. `"panel"` is the
   * redesign's: no avatar and no camera status, the glow on the mic, and a row
   * that breaks by the list's width rather than the viewport's. See
   * `ParticipantPanelMic` and the panel branch below.
   */
  layout?: "panel";
  /**
   * The glow a room with no analyser takes from `isSpeaking`, on the element
   * beside `glowRef`, where the analyser loop cannot wipe it. Panel layout only.
   */
  steadyGlow?: CSSProperties;
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
  /** Stopping and locking this person's screen share, or `null`/omitted for none. */
  shareControl?: ParticipantShareControl | null;

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
   * The member's `group_joined_at`, for the fading newcomer badge. Omitted
   * draws nothing, as does a stamp past the newcomer window.
   */
  newcomerJoinedAt?: string;
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
   * Whether this person holds a trainee seat on the group — staff and trainee
   * sight, never a family's. A trainee's token says `gedu`, so this is the one
   * thing that tells them the difference; it arrives with the chat
   * roster a moment after the room paints, which is why it is drawn last.
   */
  isTrainee?: boolean;
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
  moderationLock,
  glowRef,
  layout,
  steadyGlow,
  onMute,
  onLock,
  chatControl,
  shareControl,
  newcomerJoinedAt,
  flairNow,
  hasContent,
  isTrainee,
  onOpenFlair,
}: ParticipantRowProps) {
  const c = useTranslations("common");
  const tt = useTranslations("gedu.trainee");
  const moderatable = !p.isLocal && !p.isOwner;
  const showModMenu = isModView && moderatable;
  const lockedModMenu =
    !isModView && moderatable && moderationLock != null ? moderationLock : null;
  // Show the game identity for gedu/gamer participants, but only when the token
  // actually carried a platform. An absent platform == no game context (an
  // instant room, or a product whose topic is about no single game account) →
  // hide the slot; a `null` username == linked-but-unset → render "(Unknown)".
  // Narrowed into a local so the platform is a value the row can pass, not just
  // a condition it tested. See mapParticipant.
  const gamePlatform: GamePlatform | undefined =
    p.role === "gamer" || p.role === "gedu" ? p.gamePlatform : undefined;

  const identity = (className: string) =>
    gamePlatform && (
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
        className={className}
      />
    );

  const parentBadge = (className?: string) =>
    p.role === "customer" && (
      /* The same badge and word the roster row and admin chips draw for a
         customer, read off the shared role constants. Rendered inside a
         flex div — a Badge is a div, and this exact badge inside a <p>
         was a hydration failure once already. */
      <Badge
        variant="outline"
        className={cn(
          ROLE_BADGE_STYLES.customer,
          "shrink-0 px-1.5 py-0 text-[10px] font-normal",
          className,
        )}
      >
        {c(ROLE_LABEL_KEYS.customer)}
      </Badge>
    );

  const lateMarks = (className?: string) => (
    <>
      {newcomerJoinedAt !== undefined && flairNow !== undefined && (
        <NewcomerBadge
          joinedAt={newcomerJoinedAt}
          now={flairNow}
          className={className}
        />
      )}
      {/* The trainee tag — staff and trainee sight, arriving with the chat roster after the
          room has painted, so it is the last of the run for the same reason
          the newcomer badge follows the Parent badge. */}
      {isTrainee === true && (
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 px-1.5 py-0 text-[10px] font-normal",
            className,
          )}
        >
          {tt("badge")}
        </Badge>
      )}
    </>
  );

  const flairButton = onOpenFlair && (
    <GamerFlairButton
      name={p.userName}
      hasContent={hasContent === true}
      onOpen={onOpenFlair}
    />
  );

  /* All moderator actions collapse into one overflow menu — a single icon
     at the row's end, so the row layout is identical for every
     participant and nothing spills into the name on mobile. */
  const moderation = (
    <>
      {showModMenu && (
        <ParticipantModMenu
          name={p.userName}
          audioOn={p.audioOn}
          videoOn={p.videoOn}
          lockState={lockState}
          onMute={onMute}
          onLock={onLock}
          chatControl={chatControl}
          shareControl={shareControl}
        />
      )}
      {lockedModMenu !== null && (
        <LockedModMenuTrigger explanation={lockedModMenu} />
      )}
    </>
  );

  if (layout === "panel") {
    // A row whose second line is already there when the overlay lands. Every
    // other row has only late marks to put on one, and a line appearing on data's
    // own schedule would move every row beneath it, so those marks go on the
    // first line, at the end of the name's run, and the name gives way.
    const hasSecondLine = gamePlatform !== undefined || p.role === "customer";

    return (
      <div
        className={cn(
          // Name and trailing controls first; the identity and its badges on a
          // line of their own, because the panel's 286px cannot hold them beside
          // the 96px of controls. The break reads the list's width (`people`,
          // set on the list), never the viewport's: at the widest the panel gets,
          // the viewport is 1440 and the row is 350. `@xl` is what one line needs
          // with room left for a name: a 180px identity, two badges and the
          // controls with their gaps are 480 of it, and only the phone sheet on
          // a tablet is that wide. So `order` does the moving, as on the live row.
          "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border p-2 transition-colors @xl/people:flex-nowrap",
          p.isLocal && "bg-lifted",
        )}
      >
        {/* `flex-1` for the same reason as the live row's name: a truncating item
            otherwise contributes its full width to the line break. */}
        <span className="order-1 min-w-0 flex-1 truncate text-sm font-medium @xl/people:max-w-fit">
          {p.userName}
        </span>

        {!hasSecondLine && lateMarks(PANEL_FIRST_LINE)}

        {/* One right-packed group with the note button at its left edge, so the
            note landing late grows it into the name and moves no control. */}
        <div className="order-2 ml-auto flex h-7 shrink-0 items-center gap-2 @xl/people:order-3">
          {flairButton}
          <ParticipantPanelMic
            audioOn={p.audioOn}
            locked={lockState.audio}
            glowRef={glowRef}
            steadyGlow={steadyGlow}
          />
          {moderation}
        </div>

        {/* A late mark lands at the end of this run, as everywhere. It wraps
            rather than clip the account, which never truncates. */}
        {hasSecondLine && (
          <div className="order-3 flex w-full flex-wrap items-center gap-x-2 gap-y-1 @xl/people:order-2 @xl/people:w-auto">
            {identity(PANEL_IDENTITY_SLOT)}
            {parentBadge()}
            {lateMarks()}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        // One wrapping line, not a row of nested columns. Everything on the row
        // is a direct child so that `order` can put the game identity in two
        // different places at two widths (see the identity slot below), which
        // no amount of nesting can do.
        "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border p-2 transition-colors sm:gap-x-3",
        p.isLocal && "bg-lifted",
      )}
    >
      {/* Avatar — the ref div is the element the speaking glow writes box-shadow
          and border-color onto every animation frame, so nothing may wrap it:
          wrapping would move the glow off the face. */}
      <div ref={glowRef} className="order-1 shrink-0 rounded-md">
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
      {identity(LIVE_IDENTITY_SLOT)}

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
      {parentBadge(LIVE_BADGE_ORDER)}
      {lateMarks(LIVE_BADGE_ORDER)}

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
        {flairButton}

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

        {moderation}
      </div>
    </div>
  );
}

/**
 * The panel row's mic status, and the one place the panel's speaking glow is.
 *
 * **Two elements carry the glow, as `useParticipantGlow` says:** one takes the
 * steady glow and the other the analyser's, whose loop rewrites its element's
 * inline style every frame. Both are circles the size of the icon, under it,
 * because a shadow is drawn only outside its box: anything wider leaves a dark
 * disc around the icon with the light ringing it. They have no border, so the
 * glow's border colour draws nothing here.
 *
 * The 24px box holds its place whether or not anyone speaks, and a shadow takes no
 * layout, so a glow moves nothing. The circles sit 5px inside the box, and the
 * panel's padding and the row's border and padding add 17px to the scroller's
 * edge, past the glow's 14px at its loudest. They are positioned, so a neighbouring
 * row's ground cannot paint over them. A muted person gets neither glow: the hook
 * stops the loop and `steadyGlow` requires the mic.
 */
function ParticipantPanelMic({
  audioOn,
  locked,
  glowRef,
  steadyGlow,
}: {
  audioOn: boolean;
  locked: boolean;
  glowRef?: Ref<HTMLDivElement>;
  steadyGlow?: CSSProperties;
}) {
  return (
    <div className="relative flex h-6 w-6 shrink-0 items-center justify-center">
      <div
        style={steadyGlow}
        className="absolute inset-[5px] rounded-full transition-shadow"
      />
      <div ref={glowRef} className="absolute inset-[5px] rounded-full" />
      <div className="relative">
        {audioOn ? (
          <Mic className="h-3.5 w-3.5 text-success" />
        ) : (
          <MicOff className="h-3.5 w-3.5 text-destructive" />
        )}
        {locked && (
          <Lock className="absolute -right-1 -top-1 h-2.5 w-2.5 text-destructive" />
        )}
      </div>
    </div>
  );
}

/**
 * The moderation menu's trigger, locked: the same kebab at the same size and
 * place, with a padlock, opening the explanation rather than the menu.
 */
function LockedModMenuTrigger({
  explanation,
}: {
  explanation: LockExplanation;
}) {
  const t = useTranslations("voice");
  return (
    <LockedButton
      explanation={explanation}
      variant="ghost"
      size="icon"
      className="h-7 w-auto shrink-0 gap-0.5 px-1"
      title={t("moderate")}
      aria-label={t("moderate")}
    >
      <MoreVertical className="h-4 w-4" />
    </LockedButton>
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
 * camera, screen share and chat are the things that can be taken away from a
 * person here, so they read as a set under one divider — and the chat lock goes
 * last because whether it appears differs row by row, so its presence or absence
 * never reorders those above it.
 *
 * **The menu grows upward from the trigger, so nothing may be added to it while
 * it is open**: an item appearing would push those already on screen up, under
 * a hand that is reaching for one of them. Nothing does — a menu opening is a
 * user action, and what it holds at that moment is settled long before, because
 * the chat panel above the rail resolved its history when the room did. The stop
 * for a screen share is the one item a live event could add, so whether it is
 * offered is latched as the menu opens: a share ending while it is open disables
 * the item, and one starting waits for the next opening.
 *
 * **It is portalled to the body and placed against the viewport**, because the
 * list can sit in a scroller or a sheet that would clip it. It stays on its
 * trigger through every scroll and re-render, and it opens downward only where
 * the space above cannot hold it, which is the top rows of a panel; growing
 * downward moves nothing, so the rule above still stands there.
 */
/** The space between the menu and its trigger, and the least it keeps from the screen's edge. */
const MENU_GAP_PX = 4;

function ParticipantModMenu({
  className,
  name,
  audioOn,
  videoOn,
  lockState,
  onMute,
  onLock,
  chatControl,
  shareControl,
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
  shareControl?: ParticipantShareControl | null;
}) {
  const t = useTranslations("voice");
  // Chat's own namespace for chat's own act, rather than a copy under `voice.*`
  // — one place owns the vocabulary a lock is described in. The label is the
  // short, name-less form: this menu already carries the person's name at its
  // head and every sibling item is a bare imperative, where a message's menu has
  // no header and so names the person in the sentence.
  const m = useTranslations("chat.moderation");
  const [open, setOpen] = useState(false);
  const [offerShareStop, setOfferShareStop] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // No dependencies: anything that re-renders this row may have moved it.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = ref.current?.getBoundingClientRect();
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const height = menu.offsetHeight;
      const above = trigger.top - height - MENU_GAP_PX;
      const below = Math.min(
        trigger.bottom + MENU_GAP_PX,
        window.innerHeight - height - MENU_GAP_PX,
      );
      menu.style.top = `${above >= MENU_GAP_PX ? above : below}px`;
      menu.style.right = `${document.documentElement.clientWidth - trigger.right}px`;
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (
        ref.current &&
        e.target instanceof Node &&
        !ref.current.contains(e.target) &&
        !menuRef.current?.contains(e.target)
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
        onClick={() => {
          setOfferShareStop(shareControl?.sharing === true);
          setOpen((v) => !v);
        }}
        title={t("moderate")}
        aria-label={t("moderate")}
        aria-expanded={open}
      >
        <MoreVertical className="h-4 w-4" />
      </Button>

      {/* Opens upward where it can, so that on mobile — where the participant
          list sits at the bottom of the page — the menu never extends past the
          viewport and forces extra scroll height. Later in the body than any
          open sheet, so z-50 lands it above one. */}
      {open && createPortal(
        <div
          ref={menuRef}
          className={cn(
            "fixed z-50 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg",
            // Wider for the share items, whose French and Finnish labels are the longest here.
            shareControl != null ? "w-60" : "w-52",
          )}
        >
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
          {shareControl != null && offerShareStop && (
            <MenuItem
              icon={<ScreenShareOff className="h-4 w-4" />}
              label={t("stopScreenShare")}
              disabled={!shareControl.sharing}
              onClick={() => run(shareControl.onStop)}
            />
          )}
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
          {shareControl != null && (
            <MenuItem
              icon={
                shareControl.locked ? (
                  <LockOpen className="h-4 w-4" />
                ) : (
                  <Lock className="h-4 w-4" />
                )
              }
              label={
                shareControl.locked
                  ? t("unlockScreenShare")
                  : t("lockScreenShare")
              }
              active={shareControl.locked}
              onClick={() =>
                run(() => shareControl.onSetLock(!shareControl.locked))
              }
            />
          )}
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
        </div>,
        document.body,
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
        "hover:bg-hover disabled:pointer-events-none disabled:opacity-40",
        active ? "text-destructive" : "text-foreground",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}
