"use client";

import { useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { GripVertical, Trash2, UserRound, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { GeduPickerDialog } from "./gedu-picker-dialog";
import type { EffectiveGroup } from "@/hooks/use-group-editor";
import type { Profile, GenderType } from "@/types";

// --- Helpers ---

function computeAge(dateOfBirth: string): number {
  const today = new Date();
  const dob = new Date(dateOfBirth);
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

function formatGenderShort(gender: string): string {
  switch (gender) {
    case "boy": return "B";
    case "girl": return "G";
    case "non_binary": return "NB";
    default: return "";
  }
}

// --- Draggable gamer chip ---

interface EnrolledGamerChipProps {
  gamerId: string;
  displayName: string;
  dateOfBirth: string | null;
  gender: string | null;
  groupId: string;
  isMoved?: boolean;
}

export function EnrolledGamerChip({ gamerId, displayName, dateOfBirth, gender, groupId, isMoved }: EnrolledGamerChipProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `gamer-${gamerId}`,
    data: { gamerId, displayName, fromGroupId: groupId },
  });

  const age = dateOfBirth ? computeAge(dateOfBirth) : null;
  const genderLabel = gender ? formatGenderShort(gender) : null;
  const detail = [age !== null ? `${age}y` : null, genderLabel].filter(Boolean).join("/");

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "inline-flex cursor-grab items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        isDragging && "opacity-50",
        isMoved
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-muted text-foreground",
      )}
    >
      <GripVertical className="h-3 w-3 text-muted-foreground" />
      {displayName}
      {detail && (
        <span className="text-muted-foreground">({detail})</span>
      )}
    </div>
  );
}

// --- Droppable group card ---

interface GroupCardProps {
  group: EffectiveGroup;
  groupLabel: string;
  gedus: Pick<Profile, "id" | "display_name" | "email">[];
  usedGeduIds: string[];
  onDelete: (groupId: string) => void;
  onReassignGedu: (groupId: string, geduId: string, geduDisplayName: string) => void;
}

export function GroupCard({ group, groupLabel, gedus, usedGeduIds, onDelete, onReassignGedu }: GroupCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showReassign, setShowReassign] = useState(false);

  const { setNodeRef, isOver } = useDroppable({
    id: `group-${group.id}`,
    data: { groupId: group.id },
    disabled: group.isDeleted,
  });

  const hasGamers = group.gamers.length > 0;

  // Compute group stats
  const ages = group.gamers
    .map((g) => (g.dateOfBirth ? computeAge(g.dateOfBirth) : null))
    .filter((a): a is number => a !== null);
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
  if (genderCounts.boy > 0) genderParts.push(`${genderCounts.boy} ${genderCounts.boy === 1 ? "boy" : "boys"}`);
  if (genderCounts.girl > 0) genderParts.push(`${genderCounts.girl} ${genderCounts.girl === 1 ? "girl" : "girls"}`);
  if (genderCounts.non_binary > 0) genderParts.push(`${genderCounts.non_binary} non-binary`);

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
          <div className="space-y-0.5">
            <CardTitle className="text-base">
              {groupLabel}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({group.gamers.length} {group.gamers.length === 1 ? "gamer" : "gamers"})
              </span>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              <UserRound className="mr-1 inline h-3.5 w-3.5" />
              {group.geduDisplayName}
              {hasGamers && (ageRange || genderParts.length > 0) && (
                <span className="ml-2 text-xs">
                  ({[
                    ageRange && `age range ${ageRange}`,
                    genderParts.length > 0 && genderParts.join(", "),
                  ].filter(Boolean).join(" · ")})
                </span>
              )}
            </p>
          </div>
          {!group.isDeleted && (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowReassign(true)}
                title="Reassign gedu"
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
                title={hasGamers ? "Move all gamers out first" : "Delete group"}
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
                  displayName={g.displayName}
                  dateOfBirth={g.dateOfBirth}
                  gender={g.gender}
                  groupId={group.id}
                  isMoved={g.isMoved}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {group.isDeleted ? "Marked for deletion" : "No gamers enrolled. Drag gamers here."}
            </p>
          )}
          {group.isNew && (
            <Badge variant="secondary" className="mt-3 text-xs">
              New
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {groupLabel}?</DialogTitle>
            <DialogDescription>
              This will remove the group and its gedu assignment. This change
              won&apos;t take effect until you commit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onDelete(group.id);
                setConfirmDelete(false);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reassign gedu dialog */}
      <GeduPickerDialog
        open={showReassign}
        onOpenChange={setShowReassign}
        title={`Reassign Gedu for ${groupLabel}`}
        description="Select a different gedu for this group."
        gedus={gedus}
        excludeIds={usedGeduIds}
        highlightId={group.geduId}
        onSelect={(geduId, displayName) =>
          onReassignGedu(group.id, geduId, displayName)
        }
      />
    </>
  );
}
