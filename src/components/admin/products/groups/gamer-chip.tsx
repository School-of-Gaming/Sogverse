"use client";

import { memo } from "react";
import { useDraggable } from "@dnd-kit/core";
import { GripVertical, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { MinecraftUsernameBadge } from "@/components/minecraft/minecraft-username-badge";
import { computeAge, cn } from "@/lib/utils";
import { useTimezone } from "@/providers";
import type { GenderType } from "@/types";

const GENDER_KEY: Record<string, string> = {
  boy: "genderBoy",
  girl: "genderGirl",
  non_binary: "genderNonBinary",
};

interface ContentProps {
  gamerId: string;
  firstName: string;
  dateOfBirth: string | null;
  gender: GenderType | null;
  parentFirstName: string | null;
  parentLastName: string | null;
  minecraftUsername: string | null;
  minecraftUuid: string | null;
}

// Memoized purely-visual content: dnd-kit re-renders the wrapper on every
// pointer move, but the inner identicon/text don't need to reconcile.
const ChipContent = memo(function ChipContent({
  gamerId,
  firstName,
  dateOfBirth,
  gender,
  parentFirstName,
  parentLastName,
  minecraftUsername,
  minecraftUuid,
}: ContentProps) {
  const t = useTranslations("admin.products.groupsPanel");
  const timeZone = useTimezone();

  const detailParts: string[] = [];
  if (dateOfBirth) {
    detailParts.push(t("chip.age", { age: computeAge(dateOfBirth, timeZone) }));
  }
  if (gender && GENDER_KEY[gender]) {
    detailParts.push(t(GENDER_KEY[gender] as "genderBoy"));
  }
  const detail = detailParts.join(" / ");

  const parentName = [parentFirstName, parentLastName].filter(Boolean).join(" ");

  return (
    <>
      <Avatar className="h-7 w-7">
        <Identicon id={gamerId} size={28} />
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate leading-tight">{firstName}</p>
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
        <MinecraftUsernameBadge
          username={minecraftUsername}
          uuid={minecraftUuid}
          size="sm"
        />
      </div>
      <GripVertical className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
    </>
  );
});

interface GamerChipProps extends ContentProps {
  participationId: string;
  /** A move for this gamer is saving — greyed out and undraggable until it settles. */
  isPending?: boolean;
}

export function GamerChip({
  participationId,
  gamerId,
  firstName,
  dateOfBirth,
  gender,
  parentFirstName,
  parentLastName,
  minecraftUsername,
  minecraftUuid,
  isPending,
}: GamerChipProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `participation-${participationId}`,
    data: { participationId, gamerId, firstName },
    disabled: isPending,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      aria-disabled={isPending || undefined}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
        isPending
          ? "cursor-progress border-border bg-muted text-foreground opacity-50"
          : "cursor-grab border-border bg-muted text-foreground",
        isDragging && "opacity-50",
      )}
    >
      <ChipContent
        gamerId={gamerId}
        firstName={firstName}
        dateOfBirth={dateOfBirth}
        gender={gender}
        parentFirstName={parentFirstName}
        parentLastName={parentLastName}
        minecraftUsername={minecraftUsername}
        minecraftUuid={minecraftUuid}
      />
    </div>
  );
}
