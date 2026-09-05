"use client";

import { useState } from "react";
import Link from "next/link";
import { useDroppable } from "@dnd-kit/core";
import {
  ArrowUpRight,
  Check,
  Pencil,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { JoinVoiceButton } from "@/components/voice/JoinVoiceButton";
import type { GamePlatform } from "@/lib/constants/game-platforms";
import type { GroupPending } from "@/services/groups";
import type { ProductGroupWithDetails } from "@/types";
import { ParticipantChip } from "./participant-chip";
import type { RobloxRenderMap } from "@/services/roblox";
import { chipGameIdentity } from "./panel-rules";
import { GeduPill } from "./gedu-pill";

interface GroupColumnProps {
  group: ProductGroupWithDetails;
  pending: GroupPending;
  /** Which identity this product's chips draw, or null for a topic with none. */
  gamePlatform: GamePlatform | null;
  /** The panel's one batched Roblox lookup; undefined until it lands. */
  robloxRenders: RobloxRenderMap | undefined;
  /**
   * True when this product has a joinable voice room: remote, with a session
   * still ahead. False for in-person and completed products — no Join button.
   */
  voiceAvailable: boolean;
  /** Whether the shared session window is currently open. */
  voiceIsOpen: boolean;
  /** Pre-formatted "next open" date label for the locked Join button. */
  opensDate: string;
  /** Pre-formatted "next open" time label for the locked Join button. */
  opensTime: string;
  /**
   * Where this group's own page lives, or `undefined` on a surface that has no
   * such page to point at (a fixture-fed one, say).
   *
   * It is a **function of the id rather than a ready href** because the column
   * is rendered for a not-yet-persisted card too, whose id names no page — the
   * caller answers "what is the URL for a group" once, and this component
   * decides when there is a real group to ask about.
   */
  groupHref?: (groupId: string) => string;
  onRename: (groupId: string, name: string) => void;
  onDelete: (groupId: string) => void;
  onAddGedu: (groupId: string) => void;
  onRemoveGedu: (groupId: string, geduId: string) => void;
}

export function GroupColumn({
  group,
  pending,
  gamePlatform,
  robloxRenders,
  voiceAvailable,
  voiceIsOpen,
  opensDate,
  opensTime,
  groupHref,
  onRename,
  onDelete,
  onAddGedu,
  onRemoveGedu,
}: GroupColumnProps) {
  const t = useTranslations("admin.products.groupsPanel");
  const c = useTranslations("common");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.name);

  // A "temp-" id is an optimistic card whose create hasn't persisted yet; its
  // id isn't real, so no action can target it until the settle refetch.
  const isTemp = group.id.startsWith("temp-");
  // Voice room link for this group. `voiceAvailable` already encodes the
  // product-level gate (remote + a session still ahead); a not-yet-persisted
  // (temp) group has no real id to key a room — gate on both. Admins pass the
  // same token gate as gedus (visible moderator), so the shared
  // JoinVoiceButton + `/voice/group/[id]` route work unchanged; the button
  // auto-appends `?back=` so leaving returns to this admin page.
  const showVoice = voiceAvailable && !isTemp;
  const voiceHref = ROUTES.voice.groupSession(group.id);
  const isDeleting = pending.deletes.has(group.id);
  const isSaving = isTemp || pending.renames.has(group.id);
  const busy = isSaving || isDeleting;

  const { setNodeRef, isOver } = useDroppable({
    id: `group-target-${group.id}`,
    data: { toGroupId: group.id },
    disabled: busy,
  });

  const startEdit = () => {
    setDraft(group.name);
    setEditing(true);
  };

  const commitEdit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return; // Save is disabled; guard the Enter path too.
    if (trimmed !== group.name) onRename(group.id, trimmed);
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraft(group.name);
    setEditing(false);
  };

  return (
    <>
      <Card
        ref={setNodeRef}
        className={cn(
          "transition-colors",
          isDeleting && "opacity-40",
          isSaving && !isDeleting && "opacity-60",
          isOver && !busy && "bg-primary/5",
        )}
      >
        <CardHeader className="space-y-3 pb-3">
          <div className="flex items-start gap-2">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("group.nameLabel")}
              </Label>
              {editing ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitEdit();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          cancelEdit();
                        }
                      }}
                      placeholder={t("group.namePlaceholder")}
                      aria-invalid={!draft.trim() || undefined}
                    />
                    {/* Cancel then Save — the app-wide button order (root
                        `CLAUDE.md`, "Button Order") puts the affirmative last,
                        so it reads rightmost. This row never stacks, so it
                        needs no `flex-col-reverse`. */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={cancelEdit}
                      aria-label={t("group.cancelEditAria")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={commitEdit}
                      disabled={!draft.trim()}
                      aria-label={t("group.saveNameAria")}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                  {!draft.trim() && (
                    <p className="text-xs text-destructive">
                      {t("group.nameRequired")}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{group.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground"
                    onClick={startEdit}
                    disabled={busy}
                    aria-label={t("group.editAria", { name: group.name })}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {/* The way in to this group's own page — its notes, its
                      roster and its whole session record, rendered as the gedu
                      teaching it sees them.

                      **In the header, beside the name, and nowhere near a
                      chip.** A chip on this board is a drag handle whose entire
                      purpose is moving somebody between groups; a link inside
                      one would compete with that gesture for the same pointer
                      press. The header is the part of the card that is about
                      the *group* rather than about its people.

                      Absent on a card whose create has not landed (its id names
                      no page yet) and on one being deleted (that page is about
                      to stop existing). */}
                  {groupHref !== undefined && !isTemp && !isDeleting && (
                    <Link
                      href={groupHref(group.id)}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        // h-8 rather than sm's h-9: level with the name's line
                        // box beside it, without out-sizing the h-7 pencil in
                        // between.
                        "h-8 shrink-0 gap-1 px-2.5",
                      )}
                    >
                      {/* Named for what is behind it, not "View details": with
                          the sessions panel gone, this link is the only way
                          from here to a group's attendance and session
                          reports — the two things an admin comes looking for
                          every month — and a generic label hides that. */}
                      {t("attendanceAndReports")}
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  )}
                </div>
              )}
            </div>
            {/* Right-side action cluster: Join (live/locked) sits left of the
                destructive Delete. `mt-6` drops the cluster to align with the
                group name under its label. */}
            <div className="mt-6 flex shrink-0 items-center gap-2">
              {showVoice && (
                <JoinVoiceButton
                  voiceIsOpen={voiceIsOpen}
                  voiceHref={voiceHref}
                  opensDate={opensDate}
                  opensTime={opensTime}
                />
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                title={t("group.deleteAria", { name: group.name })}
                aria-label={t("group.deleteAria", { name: group.name })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span>
              {t("group.participantCount", { count: group.participations.length })}
            </span>
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
                    isSaving={pending.gedus.has(`${group.id}:${ge.id}`)}
                    disabled={busy}
                    onRemove={() => onRemoveGedu(group.id, ge.id)}
                  />
                ))}
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onAddGedu(group.id)}
              disabled={busy}
              className="gap-1.5"
            >
              <UserPlus className="h-4 w-4" />
              {t("group.addGedu")}
            </Button>
          </div>

          {/* Participations row */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("group.participantsLabel")}
            </Label>
            {group.participations.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("group.empty")}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {group.participations.map((p) => (
                  <ParticipantChip
                    key={p.id}
                    participationId={p.id}
                    participantId={p.participant_id}
                    participantEmail={p.participant_email}
                    firstName={p.participant_first_name}
                    dateOfBirth={p.participant_date_of_birth}
                    gender={p.participant_gender}
                    parentFirstName={p.parent_first_name}
                    parentLastName={p.parent_last_name}
                    {...chipGameIdentity(p, gamePlatform, robloxRenders)}
                    isPending={pending.moves.has(p.id) || pending.removes.has(p.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("group.deleteConfirmTitle", { name: group.name })}
        description={
          group.participations.length === 0
            ? t("group.deleteConfirmEmpty")
            : t("group.deleteConfirmWithParticipants", {
                count: group.participations.length,
              })
        }
        confirmLabel={c("delete")}
        onConfirm={() => onDelete(group.id)}
      />
    </>
  );
}
