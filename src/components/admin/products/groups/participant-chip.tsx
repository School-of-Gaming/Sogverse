"use client";

import {
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useDndMonitor, useDraggable } from "@dnd-kit/core";
import { GripVertical, Mail, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Identicon } from "@/components/ui/identicon";
import { GameUsernameRow } from "@/components/game-account";
import { ROLE_BADGE_STYLES, ROLE_LABEL_KEYS } from "@/lib/constants/roles";
import { computeAge } from "@/lib/gamer-age-eligibility";
import { cn } from "@/lib/cn";
import { gamerBirthOf } from "@/lib/gamer-birth";
import { useTimezone } from "@/providers";
import type { GenderType } from "@/types";
import type { ChipGameIdentity } from "./panel-rules";
import { SeatMenuContext, SeatMenuPanel, seatMenuRows } from "./seat-menu";

// `satisfies` keeps the record exhaustive over GenderType while the values
// keep their literal types, so t(GENDER_KEY[gender]) typechecks unasserted.
const GENDER_KEY = {
  boy: "genderBoy",
  girl: "genderGirl",
  non_binary: "genderNonBinary",
} as const satisfies Record<GenderType, string>;

/**
 * The chip is dumb about game identities: which platform a product is about,
 * which columns feed the row and where a Roblox render came from are all the
 * panel's business (see `chipGameIdentity` in ./panel-rules). What arrives here
 * is one platform's worth of identity, or `gamePlatform: null` for a product
 * about no game account at all — and then the chip simply has no identity row.
 */
interface ContentProps extends ChipGameIdentity {
  participantId: string;
  firstName: string;
  /** The child's birth year and month; null together on an adult seat. */
  birthYear: number | null;
  birthMonth: number | null;
  gender: GenderType | null;
  parentFirstName: string | null;
  parentLastName: string | null;
  /**
   * The seat-holder's own address, on an adult seat only — and the chip's whole
   * discriminator. The RPC emits it where participant = customer and nowhere
   * else, so non-null means "this is a parent's own seat".
   */
  participantEmail: string | null;
}

// Memoized purely-visual content: dnd-kit re-renders the wrapper on every
// pointer move, but the inner identicon/text don't need to reconcile.
const ChipContent = memo(function ChipContent({
  participantId,
  firstName,
  birthYear,
  birthMonth,
  gender,
  parentFirstName,
  parentLastName,
  gamePlatform,
  gameUsername,
  gameExternalId,
  gameAvatarUrl,
  participantEmail,
}: ContentProps) {
  const t = useTranslations("admin.products.groupsPanel");
  const c = useTranslations("common");
  const timeZone = useTimezone();

  const isAdult = participantEmail !== null;

  const detailParts: string[] = [];
  const birth = gamerBirthOf(birthYear, birthMonth);
  if (birth) {
    detailParts.push(t("chip.age", { age: computeAge(birth, timeZone) }));
  }
  if (gender) {
    detailParts.push(t(GENDER_KEY[gender]));
  }
  const detail = detailParts.join(" / ");

  const parentName = [parentFirstName, parentLastName].filter(Boolean).join(" ");

  return (
    <>
      <Avatar className="h-7 w-7">
        <Identicon id={participantId} size={28} />
      </Avatar>
      <div className="min-w-0 flex-1">
        {/* A div, not a p: Badge renders a div, and a block element inside a
            p is invalid HTML — the browser closes the p early and hydration
            fails on the mismatch. */}
        <div className="flex min-w-0 items-center gap-1.5 leading-tight">
          <span className="truncate">{firstName}</span>
          {isAdult && (
            /* Read off the shared role constants, the same badge the picker
               and the admin user list draw for a customer profile. An admin
               dragging chips between three columns needs "this one is a
               grown-up" to be the same shape everywhere they meet it. */
            <Badge
              variant="outline"
              className={cn(
                ROLE_BADGE_STYLES.customer,
                "shrink-0 px-1 py-0 text-[9px] font-normal leading-tight",
              )}
            >
              {c(ROLE_LABEL_KEYS.customer)}
            </Badge>
          )}
        </div>
        {/* An adult seat carries none of the three child-shaped facts — no
            gamer profile, no linked game account — so the chip simply does not
            draw those lines. Three empty rows would read as a chip that failed
            to load, and reserving their height would leave a hole beside
            content that can never sit next to it. What takes their place is the
            one thing the child variant has no room for and no need of: the
            address, because there is no parent to name. */}
        {isAdult ? (
          <p
            className="flex items-center gap-1 text-[10px] leading-tight text-muted-foreground"
            aria-label={t("chip.participantEmail", { email: participantEmail })}
          >
            <Mail className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{participantEmail}</span>
          </p>
        ) : (
          <>
            {detail && (
              <p className="text-[10px] leading-tight text-muted-foreground">
                {detail}
              </p>
            )}
            {parentName && (
              <p
                className="flex items-center gap-1 text-[10px] leading-tight text-muted-foreground"
                aria-label={t("chip.parent", { name: parentName })}
              >
                <User className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{parentName}</span>
              </p>
            )}
            {/* No platform, no row — the same call the adult variant above
                makes. A product about Programming or Esports is about no single
                account a child holds, so there is nothing to draw and nothing
                that could later appear in that slot; a reserved empty line
                beside content that can never sit next to it would read as a
                chip that failed to load. The chip is simply shorter. */}
            {gamePlatform !== null && (
              <GameUsernameRow
                platform={gamePlatform}
                username={gameUsername}
                externalId={gameExternalId}
                // Three meanings, and the panel picked one: omitted lets a
                // Minecraft row derive the face from the name, a string is the
                // Roblox render the panel's one batched lookup resolved, and
                // null is the placeholder — what an unverified handle, an
                // in-flight batch and a fixture all pass.
                avatarUrl={gameAvatarUrl}
                // The compact figure. The chip is a stack of four short lines in a
                // 16rem rail, and the whole body was taller than the other three put
                // together — the face carries the same identity at roughly the height
                // of the text beside it. Square on both platforms, so the chip's
                // geometry is identical whichever one the product is about.
                figure="head"
                // A picture butting straight against the parent's name reads as
                // cramped. The gap is the call site's, not the row's: only this chip
                // and the admin user page want it, so the component stays unpadded and
                // every other surface keeps its tight rhythm.
                className="mt-2"
              />
            )}
          </>
        )}
      </div>
      <GripVertical className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
    </>
  );
});

interface ParticipantChipProps extends ContentProps {
  participationId: string;
  /** A move for this seat is saving — greyed out and undraggable until it settles. */
  isPending?: boolean;
}

/**
 * One seat on the board: a drag handle end to end, and — pressed without
 * dragging — the trigger of that seat's menu.
 *
 * **The chip carries no button of its own.** A control sitting on a handle
 * competes with the gesture the handle exists for, so the menu is the chip's
 * own press: a click (or Enter, Space or ArrowDown on the focused chip) opens
 * it, and a drag never does. The two cannot be confused because dnd-kit
 * decides between them: the panel's pointer sensor only activates a drag after
 * five pixels of travel, and once it has, it swallows the click that ends the
 * gesture, so the press that ends a drag never reaches the chip. The other
 * direction holds too — the open panel is a sibling of the draggable element,
 * not inside it, so pressing a row starts no drag, and a drag that does start
 * from the chip closes the menu.
 *
 * Which rows the menu holds is the panel's decision (`seatMenuItems`), handed
 * down through `SeatMenuContext`; a chip with no context, or one whose seat is
 * mid-write, is a plain handle.
 */
export function ParticipantChip({
  participationId,
  participantId,
  firstName,
  birthYear,
  birthMonth,
  gender,
  parentFirstName,
  parentLastName,
  gamePlatform,
  gameUsername,
  gameExternalId,
  gameAvatarUrl,
  participantEmail,
  isPending,
}: ParticipantChipProps) {
  const t = useTranslations("admin.products.groupsPanel.seatMenu");
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `participation-${participationId}`,
    data: { participationId, participantId, firstName },
    disabled: isPending,
  });

  const seatMenu = useContext(SeatMenuContext);
  const items = isPending ? null : (seatMenu?.itemsFor(participationId) ?? null);
  const hasMenu = items !== null && items.length > 0;

  const [open, setOpen] = useState(false);
  const menuOpen = open && hasMenu;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Which end to land focus on when the menu is opened from the keyboard — the
  // panel is not in the DOM until that open renders, so the intent waits here
  // for the effect below. A pointer open focuses nothing: a focused row wears
  // a filled ground, and a menu opened by a click would show a row selected.
  const focusOnOpenRef = useRef<"first" | "last" | null>(null);

  // A drag starting from this chip closes its menu: the panel would otherwise
  // hang under a chip that is being carried somewhere else.
  const monitor = useMemo(() => ({ onDragStart: () => setOpen(false) }), []);
  useDndMonitor(monitor);

  // Listeners only while the panel is open, as the session card menu does:
  // a board holds fifty chips, and at most one menu is ever open.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target;
      if (
        wrapperRef.current !== null &&
        target instanceof Node &&
        wrapperRef.current.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      chipRef.current?.focus();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const want = focusOnOpenRef.current;
    focusOnOpenRef.current = null;
    if (want === null) return;
    const rows = seatMenuRows(panelRef.current);
    if (rows.length === 0) return;
    (want === "first" ? rows[0] : rows[rows.length - 1]).focus();
  }, [menuOpen]);

  const setChipRef = (node: HTMLDivElement | null) => {
    chipRef.current = node;
    setNodeRef(node);
  };

  const handleChipKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!hasMenu) return;
    const { key } = event;
    if (key === "Enter" || key === " " || key === "ArrowDown") {
      event.preventDefault();
      focusOnOpenRef.current = "first";
      setOpen(true);
    } else if (key === "ArrowUp") {
      event.preventDefault();
      focusOnOpenRef.current = "last";
      setOpen(true);
    }
  };

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const { key } = event;
    if (key === "Tab") {
      // Tabbing out of a menu closes it, so a panel is never left painted over
      // a board the keyboard has already left.
      setOpen(false);
      return;
    }
    if (
      key !== "ArrowDown" &&
      key !== "ArrowUp" &&
      key !== "Home" &&
      key !== "End"
    ) {
      return;
    }
    event.preventDefault();
    const rows = seatMenuRows(panelRef.current);
    if (rows.length === 0) return;
    if (key === "Home") return rows[0].focus();
    if (key === "End") return rows[rows.length - 1].focus();
    const active = document.activeElement;
    const current = active instanceof HTMLElement ? rows.indexOf(active) : -1;
    const step = key === "ArrowDown" ? 1 : -1;
    const next = (((current + step) % rows.length) + rows.length) % rows.length;
    rows[next].focus();
  };

  const chip = (
    <div
      ref={setChipRef}
      {...listeners}
      {...attributes}
      {...(hasMenu
        ? {
            "aria-haspopup": "menu" as const,
            "aria-expanded": menuOpen,
            onClick: () => setOpen((was) => !was),
            onKeyDown: handleChipKeyDown,
          }
        : {})}
      aria-disabled={isPending || undefined}
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-xs font-medium transition-colors",
        // `py-2` rather than `py-1.5`: the chip carries a picture now, and the
        // extra 2px a side is what keeps the stack from touching its own border.
        isPending
          ? "cursor-progress border-border bg-lifted text-foreground opacity-50"
          // Shared drag-cursor class (globals.css): grab on hover. The grabbing
          // cursor while dragging comes from the DragOverlay's `drag-ghost`.
          : "drag-handle border-border bg-lifted text-foreground",
        isDragging && "opacity-50",
      )}
    >
      <ChipContent
        participantId={participantId}
        firstName={firstName}
        birthYear={birthYear}
        birthMonth={birthMonth}
        gender={gender}
        parentFirstName={parentFirstName}
        parentLastName={parentLastName}
        gamePlatform={gamePlatform}
        gameUsername={gameUsername}
        gameExternalId={gameExternalId}
        gameAvatarUrl={gameAvatarUrl}
        participantEmail={participantEmail}
      />
    </div>
  );

  // The wrapper is what the panel is positioned against, and it takes the
  // chip's own place in whatever row holds it — a block around the chip, sized
  // by it. It is there whether or not the seat has a menu right now, so a chip
  // going busy mid-write keeps its element (and its focus) rather than being
  // remounted one level up.
  return (
    <div ref={wrapperRef} className="relative">
      {chip}
      {menuOpen && seatMenu !== null && (
        <SeatMenuPanel
          ref={panelRef}
          label={t("label", { name: firstName })}
          items={items}
          onKeyDown={handlePanelKeyDown}
          onSelect={(action) => {
            setOpen(false);
            // Focus goes back to the chip before the row's flow opens, so the
            // dialog or sheet it opens hands focus back here when it closes,
            // rather than to a row that has already unmounted.
            chipRef.current?.focus();
            seatMenu.onSelect(participationId, firstName, action);
          }}
        />
      )}
    </div>
  );
}
