"use client";

import { memo } from "react";
import { useDraggable } from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { computeAge, cn } from "@/lib/utils";
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
}

// Memoized purely-visual content: dnd-kit re-renders the wrapper on every
// pointer move, but the inner identicon/text don't need to reconcile.
const ChipContent = memo(function ChipContent({
  gamerId,
  firstName,
  dateOfBirth,
  gender,
}: ContentProps) {
  const t = useTranslations("admin.productsV2.groupsPanel");

  const detailParts: string[] = [];
  if (dateOfBirth) {
    detailParts.push(t("chip.age", { age: computeAge(dateOfBirth) }));
  }
  if (gender && GENDER_KEY[gender]) {
    detailParts.push(t(GENDER_KEY[gender] as "genderBoy"));
  }
  const detail = detailParts.join(" / ");

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
      </div>
      <GripVertical className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
    </>
  );
});

interface GamerChipProps extends ContentProps {
  participationId: string;
  isMoved?: boolean;
}

export function GamerChip({
  participationId,
  gamerId,
  firstName,
  dateOfBirth,
  gender,
  isMoved,
}: GamerChipProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `participation-${participationId}`,
    data: { participationId, gamerId, firstName },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "flex cursor-grab items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
        isDragging && "opacity-50",
        isMoved
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-muted text-foreground",
      )}
    >
      <ChipContent
        gamerId={gamerId}
        firstName={firstName}
        dateOfBirth={dateOfBirth}
        gender={gender}
      />
    </div>
  );
}
