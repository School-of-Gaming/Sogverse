"use client";

import { memo } from "react";
import { useDraggable } from "@dnd-kit/core";
import { GripVertical, Mail, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Identicon } from "@/components/ui/identicon";
import { GameUsernameRow } from "@/components/game-account";
import { ROLE_BADGE_STYLES, ROLE_LABEL_KEYS } from "@/lib/constants";
import { computeAge, cn } from "@/lib/utils";
import { useTimezone } from "@/providers";
import type { GenderType } from "@/types";

// `satisfies` keeps the record exhaustive over GenderType while the values
// keep their literal types, so t(GENDER_KEY[gender]) typechecks unasserted.
const GENDER_KEY = {
  boy: "genderBoy",
  girl: "genderGirl",
  non_binary: "genderNonBinary",
} as const satisfies Record<GenderType, string>;

interface ContentProps {
  participantId: string;
  firstName: string;
  dateOfBirth: string | null;
  gender: GenderType | null;
  parentFirstName: string | null;
  parentLastName: string | null;
  minecraftUsername: string | null;
  minecraftUuid: string | null;
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
  dateOfBirth,
  gender,
  parentFirstName,
  parentLastName,
  minecraftUsername,
  minecraftUuid,
  participantEmail,
}: ContentProps) {
  const t = useTranslations("admin.products.groupsPanel");
  const c = useTranslations("common");
  const timeZone = useTimezone();

  const isAdult = participantEmail !== null;

  const detailParts: string[] = [];
  if (dateOfBirth) {
    detailParts.push(t("chip.age", { age: computeAge(dateOfBirth, timeZone) }));
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
        <p className="flex min-w-0 items-center gap-1.5 leading-tight">
          <span className="truncate">{firstName}</span>
          {isAdult && (
            /* Read off the shared role constants, the same badge the picker
               and the admin user list draw for a customer profile. An admin
               dragging chips between three columns needs "this one is a
               grown-up" to be the same shape everywhere they meet it. */
            <Badge
              className={cn(
                ROLE_BADGE_STYLES.customer,
                "shrink-0 px-1 py-0 text-[9px] font-normal leading-tight",
              )}
            >
              {c(ROLE_LABEL_KEYS.customer)}
            </Badge>
          )}
        </p>
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
            <GameUsernameRow
              platform="minecraft"
              username={minecraftUsername}
              externalId={minecraftUuid}
              // The compact figure. The chip is a stack of four short lines in a
              // 16rem rail, and the whole body was taller than the other three put
              // together — the face carries the same identity at roughly the height
              // of the text beside it.
              figure="head"
              // A picture butting straight against the parent's name reads as
              // cramped. The gap is the call site's, not the row's: only this chip
              // and the admin user page want it, so the component stays unpadded and
              // every other surface keeps its tight rhythm.
              className="mt-2"
            />
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

export function ParticipantChip({
  participationId,
  participantId,
  firstName,
  dateOfBirth,
  gender,
  parentFirstName,
  parentLastName,
  minecraftUsername,
  minecraftUuid,
  participantEmail,
  isPending,
}: ParticipantChipProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `participation-${participationId}`,
    data: { participationId, participantId, firstName },
    disabled: isPending,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      aria-disabled={isPending || undefined}
      className={cn(
        // `py-2` rather than `py-1.5`: the chip carries a picture now, and the
        // extra 2px a side is what keeps the stack from touching its own border.
        "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors",
        isPending
          ? "cursor-progress border-border bg-muted text-foreground opacity-50"
          // Shared drag-cursor class (globals.css): grab on hover. The grabbing
          // cursor while dragging comes from the DragOverlay's `drag-ghost`.
          : "drag-handle border-border bg-muted text-foreground",
        isDragging && "opacity-50",
      )}
    >
      <ChipContent
        participantId={participantId}
        firstName={firstName}
        dateOfBirth={dateOfBirth}
        gender={gender}
        parentFirstName={parentFirstName}
        parentLastName={parentLastName}
        minecraftUsername={minecraftUsername}
        minecraftUuid={minecraftUuid}
        participantEmail={participantEmail}
      />
    </div>
  );
}
