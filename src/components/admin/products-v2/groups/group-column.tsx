"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Trash2, UserPlus, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { EffectiveGroupV2 } from "@/hooks/use-group-editor-v2";
import { GamerChip } from "./gamer-chip";
import { GeduPill } from "./gedu-pill";

interface GroupColumnProps {
  group: EffectiveGroupV2;
  onRename: (groupId: string, name: string) => void;
  onDelete: (groupId: string) => void;
  onAddGedu: (groupId: string) => void;
  onRemoveGedu: (groupId: string, geduId: string) => void;
}

export function GroupColumn({
  group,
  onRename,
  onDelete,
  onAddGedu,
  onRemoveGedu,
}: GroupColumnProps) {
  const t = useTranslations("admin.productsV2.groupsPanel");
  const c = useTranslations("common");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { setNodeRef, isOver } = useDroppable({
    id: `group-target-${group.id}`,
    data: { toGroupId: group.id },
    disabled: group.isDeleted,
  });

  // Effective Gedus that haven't been marked for removal still count toward
  // the "active" Gedu list shown in the count.
  const activeGedus = group.gedus.filter((g) => !g.isPendingRemove);

  // Live (non-deleted) groups must have a non-blank name before the admin
  // can review/apply. Surface the error inline so they don't have to hunt
  // for the offending column.
  const hasBlankName = !group.isDeleted && !group.name.trim();

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
        <CardHeader className="space-y-3 pb-3">
          <div className="flex items-start gap-2">
            <div className="flex-1 space-y-1.5">
              <Label
                htmlFor={`group-${group.id}-name`}
                className="text-xs uppercase tracking-wide text-muted-foreground"
              >
                {t("group.nameLabel")}
              </Label>
              <Input
                id={`group-${group.id}-name`}
                value={group.name}
                onChange={(e) => onRename(group.id, e.target.value)}
                disabled={group.isDeleted}
                placeholder={t("group.namePlaceholder")}
                aria-invalid={hasBlankName || undefined}
                aria-describedby={
                  hasBlankName ? `group-${group.id}-name-error` : undefined
                }
                className={cn(
                  hasBlankName &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              />
              {hasBlankName && (
                <p
                  id={`group-${group.id}-name-error`}
                  className="text-xs text-destructive"
                >
                  {t("group.nameRequired")}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-6 h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
              disabled={group.isDeleted}
              title={t("group.deleteAria", { name: group.name })}
              aria-label={t("group.deleteAria", { name: group.name })}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span>
              {t("group.gamerCount", { count: group.participations.length })}
            </span>
            {group.isNew && (
              <Badge variant="secondary" className="text-[10px]">
                {t("group.new")}
              </Badge>
            )}
            {group.isDeleted && (
              <Badge variant="outline" className="text-[10px]">
                {t("group.markedForDeletion")}
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Gedus row */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("group.assignedGedus")}
            </Label>
            {group.gedus.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("group.noGedus")}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {group.gedus.map((ge) => (
                  <GeduPill
                    key={ge.id}
                    geduId={ge.id}
                    firstName={ge.first_name}
                    email={ge.email}
                    isPending={ge.isPending}
                    isPendingRemove={ge.isPendingRemove}
                    onRemove={
                      group.isDeleted
                        ? undefined
                        : () => onRemoveGedu(group.id, ge.id)
                    }
                  />
                ))}
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onAddGedu(group.id)}
              disabled={group.isDeleted}
              className="gap-1.5"
            >
              <UserPlus className="h-4 w-4" />
              {t("group.addGedu")}
            </Button>
          </div>

          {/* Participations row */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("group.gamersLabel")}
            </Label>
            {group.participations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {group.isDeleted ? t("group.willBeDeleted") : t("group.empty")}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {group.participations.map((p) => (
                  <GamerChip
                    key={p.id}
                    participationId={p.id}
                    gamerId={p.gamer_id}
                    firstName={p.gamer_first_name}
                    dateOfBirth={p.gamer_date_of_birth}
                    gender={p.gamer_gender}
                    parentFirstName={p.gamer_parent_first_name}
                    parentLastName={p.gamer_parent_last_name}
                    minecraftUsername={p.gamer_minecraft_username}
                    minecraftUuid={p.gamer_minecraft_uuid}
                    isMoved={p.isMoved}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Tiny status footnote when active gedu count differs from total */}
          {activeGedus.length !== group.gedus.length && (
            <p className="text-[10px] text-muted-foreground">
              {t("group.geduStatusFootnote")}
            </p>
          )}
        </CardContent>
      </Card>

      {confirmDelete && (
        <Dialog open onOpenChange={setConfirmDelete}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {t("group.deleteConfirmTitle", { name: group.name })}
              </DialogTitle>
              <DialogDescription>
                {group.participations.length === 0
                  ? t("group.deleteConfirmEmpty")
                  : t("group.deleteConfirmWithGamers", {
                      count: group.participations.length,
                    })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDelete(false)}>
                {c("cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  onDelete(group.id);
                  setConfirmDelete(false);
                }}
              >
                {c("delete")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
