"use client";

import { memo, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { GripVertical, Trash2, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn, computeAge } from "@/lib/utils";
import { useTimezone } from "@/providers";
import { GeduPickerDialog } from "./gedu-picker-dialog";
import type { EffectiveGroup } from "@/hooks/use-group-editor";
import type { Profile, GenderType } from "@/types";

// --- Helpers ---

const GENDER_KEYS: Record<string, string> = {
  boy: "genderBoy",
  girl: "genderGirl",
  non_binary: "genderNonBinary",
};

// --- Draggable gamer chip ---

// Memoized visual content — dnd-kit context changes re-render the wrapper
// (useDraggable subscribes to DndContext) but this inner component skips
// reconciliation since its primitive props don't change during drag.
const GamerChipContent = memo(function GamerChipContent({
  gamerId,
  firstName,
  dateOfBirth,
  gender,
}: {
  gamerId: string;
  firstName: string;
  dateOfBirth: string;
  gender: string;
}) {
  const t = useTranslations('admin.groups');
  const timeZone = useTimezone();
  const genderLabel = GENDER_KEYS[gender] ? t(GENDER_KEYS[gender] as "genderBoy") : "";
  const detail = `${computeAge(dateOfBirth, timeZone)}y / ${genderLabel}`;

  return (
    <>
      <Avatar className="h-7 w-7">
        <Identicon id={gamerId} size={28} />
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate leading-tight">{firstName}</p>
        {detail && (
          <p className="text-[10px] leading-tight text-muted-foreground">{detail}</p>
        )}
      </div>
      <GripVertical className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
    </>
  );
});

interface EnrolledGamerChipProps {
  gamerId: string;
  firstName: string;
  dateOfBirth: string;
  gender: string;
  groupId: string;
  isMoved?: boolean;
}

export function EnrolledGamerChip({ gamerId, firstName, dateOfBirth, gender, groupId, isMoved }: EnrolledGamerChipProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `gamer-${gamerId}`,
    data: { gamerId, firstName, fromGroupId: groupId },
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
      <GamerChipContent
        gamerId={gamerId}
        firstName={firstName}
        dateOfBirth={dateOfBirth}
        gender={gender}
      />
    </div>
  );
}

// --- Droppable group card ---

interface GroupCardProps {
  group: EffectiveGroup;
  groupLabel: string;
  gedus: Pick<Profile, "id" | "first_name" | "email">[];
  usedGeduIds: string[];
  onDelete: (groupId: string) => void;
  onReassignGedu: (groupId: string, geduId: string, geduFirstName: string) => void;
}

export function GroupCard({ group, groupLabel, gedus, usedGeduIds, onDelete, onReassignGedu }: GroupCardProps) {
  const t = useTranslations('admin.groups');
  const c = useTranslations('common');
  const timeZone = useTimezone();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showReassign, setShowReassign] = useState(false);

  const { setNodeRef, isOver } = useDroppable({
    id: `group-${group.id}`,
    data: { groupId: group.id },
    disabled: group.isDeleted,
  });

  const hasGamers = group.gamers.length > 0;

  // Compute group stats
  const ages = group.gamers.map((g) => computeAge(g.dateOfBirth, timeZone));
  const ageRange = ages.length > 0
    ? ages.length === 1
      ? `${ages[0]}y`
      : `${Math.min(...ages)}–${Math.max(...ages)}y`
    : null;

  const genderCounts: Record<GenderType, number> = { boy: 0, girl: 0, non_binary: 0 };
  for (const g of group.gamers) {
    if (g.gender === "boy" || g.gender === "girl" || g.gender === "non_binary") {
      genderCounts[g.gender]++;
    }
  }
  const genderParts: string[] = [];
  if (genderCounts.boy > 0) genderParts.push(t('boyCount', { count: genderCounts.boy }));
  if (genderCounts.girl > 0) genderParts.push(t('girlCount', { count: genderCounts.girl }));
  if (genderCounts.non_binary > 0) genderParts.push(t('nonBinaryCount', { count: genderCounts.non_binary }));

  return (
    <>
      <Card
        ref={setNodeRef}
        className={cn(
          "transition-colors",
          group.isDeleted && "opacity-40",
          group.isNew && "border-primary/30",
          isOver && !group.isDeleted && "border-primary bg-primary/5",
        )}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <Identicon id={group.geduId} size={40} />
            </Avatar>
            <div className="space-y-0.5">
              <CardTitle className="text-base">
                {groupLabel}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({t('gamerCount', { count: group.gamers.length })})
                </span>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {group.geduFirstName}
              </p>
              {hasGamers && (ageRange || genderParts.length > 0) && (
                <p className="text-xs text-muted-foreground">
                  {/* eslint-disable i18next/no-literal-string -- ", " and " · " are typographic separators, same in every locale */}
                  {[
                    ageRange && t('ageRangeLabel', { range: ageRange }),
                    genderParts.length > 0 && genderParts.join(", "),
                  ].filter(Boolean).join(" · ")}
                  {/* eslint-enable i18next/no-literal-string -- end separators block */}
                </p>
              )}
            </div>
          </div>
          {!group.isDeleted && (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowReassign(true)}
                title={t('reassignGedu')}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => {
                  if (hasGamers) return;
                  setConfirmDelete(true);
                }}
                disabled={hasGamers}
                title={hasGamers ? t('moveGamersFirst') : t('deleteGroup')}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {group.gamers.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {group.gamers.map((g) => (
                <EnrolledGamerChip
                  key={g.gamerId}
                  gamerId={g.gamerId}
                  firstName={g.firstName}
                  dateOfBirth={g.dateOfBirth}
                  gender={g.gender}
                  groupId={group.id}
                  isMoved={g.isMoved}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {group.isDeleted ? t('markedForDeletion') : t('noGamersEnrolled')}
            </p>
          )}
          {group.isNew && (
            <Badge variant="secondary" className="mt-3 text-xs">
              {t('new')}
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation — only mounted when open to avoid reconciliation during drag */}
      {confirmDelete && (
        <Dialog open onOpenChange={setConfirmDelete}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('deleteGroupConfirmTitle', { label: groupLabel })}</DialogTitle>
              <DialogDescription>
                {t('deleteGroupConfirmDescription')}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDelete(false)}>
                {c('cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  onDelete(group.id);
                  setConfirmDelete(false);
                }}
              >
                {c('delete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Reassign gedu — only mounted when open to avoid reconciliation during drag */}
      {showReassign && (
        <GeduPickerDialog
          open
          onOpenChange={setShowReassign}
          title={t('reassignGeduFor', { label: groupLabel })}
          description={t('selectDifferentGedu')}
          gedus={gedus}
          excludeIds={usedGeduIds}
          highlightId={group.geduId}
          onSelect={(geduId, firstName) =>
            onReassignGedu(group.id, geduId, firstName)
          }
        />
      )}
    </>
  );
}
