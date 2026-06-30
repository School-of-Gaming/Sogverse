"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDndContext,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { AlertTriangle, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import {
  useAddGedu,
  useAdminAddGamerToProduct,
  useAdminRemoveGamerFromProduct,
  useCreateGroup,
  useDeleteGroup,
  useDemoteToWaitlist,
  useGroupPending,
  useMoveParticipation,
  useProductGroups,
  usePromoteFromWaitlist,
  useRemoveGedu,
  useRenameGroup,
} from "@/services/groups";
import { SeatAvailabilityBar } from "@/components/public/products/seat-availability-bar";
import { GamerPickerSheet } from "../gamer-picker-sheet";
import { GeduPickerSheet } from "../gedu-picker-sheet";
import { GamerChip } from "./gamer-chip";
import { GroupColumn } from "./group-column";
import { UnassignedCard } from "./unassigned-card";
import { WaitlistCard } from "./waitlist-card";
import type { ProductGroupsSnapshot, ProductType } from "@/types";

interface GroupsPanelProps {
  productId: string;
  productType: ProductType;
  /** Capacity cap, or null for uncapped — drives the seat-availability bar. */
  seatCount: number | null;
  /** Whether the product opens a waitlist once full — drives the seat bar copy. */
  waitlistEnabled: boolean;
  /**
   * True when this product has a joinable voice room: remote, and with a
   * session still ahead of it. False for in-person products and for
   * completed ones (no future occurrence) — the Join button is hidden.
   */
  voiceAvailable: boolean;
  /** Whether the shared session window is currently open. */
  voiceIsOpen: boolean;
  /** Pre-formatted "next open" date label for the locked Join button. */
  opensDate: string;
  /** Pre-formatted "next open" time label for the locked Join button. */
  opensTime: string;
}

// ---------------------------------------------------------------------------
// dnd-kit payload readers. Drag/drop `data.current` is an untyped record, so
// these narrow it by checking the discriminating fields for real. Unknown
// shapes return null and the handlers no-op — a drag must never throw.
// ---------------------------------------------------------------------------

/** Payload attached by GamerChip's useDraggable. */
interface GamerDragData {
  participationId: string;
  firstName: string;
}

function readGamerDragData(value: unknown): GamerDragData | null {
  if (typeof value !== "object" || value === null) return null;
  if (
    !("participationId" in value) ||
    typeof value.participationId !== "string"
  ) {
    return null;
  }
  if (!("firstName" in value) || typeof value.firstName !== "string") {
    return null;
  }
  return {
    participationId: value.participationId,
    firstName: value.firstName,
  };
}

/**
 * Payload attached by the droppables: group columns and the unassigned card
 * carry `{ toGroupId }` (null = unassigned inbox); the header's removal zone
 * carries `{ remove: true }`; the waitlist card carries `{ waitlist: true }`.
 */
type DropData =
  | { kind: "move"; toGroupId: string | null }
  | { kind: "remove" }
  | { kind: "waitlist" };

function readDropData(value: unknown): DropData | null {
  if (typeof value !== "object" || value === null) return null;
  if ("remove" in value && value.remove === true) return { kind: "remove" };
  if ("waitlist" in value && value.waitlist === true) return { kind: "waitlist" };
  if ("toGroupId" in value) {
    const { toGroupId } = value;
    if (typeof toGroupId === "string" || toGroupId === null) {
      return { kind: "move", toGroupId };
    }
  }
  return null;
}

// Renders the chip in the floating overlay during a drag. Reads `active` from
// dnd-kit context so we don't propagate it through props (which would re-render
// the entire panel on every pointer move).
function DragOverlayContent({
  snapshot,
}: {
  snapshot: ProductGroupsSnapshot | undefined;
}) {
  const { active } = useDndContext();

  const overlay = useMemo(() => {
    if (!active || !snapshot) return null;
    const data = readGamerDragData(active.data.current);
    if (!data) return null;

    const all = [
      ...snapshot.unassigned,
      ...snapshot.groups.flatMap((g) => g.participations),
      ...snapshot.waitlist,
    ];
    return all.find((p) => p.id === data.participationId) ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on active?.id rather than the ref-changing `active` object
  }, [active?.id, snapshot]);

  if (!overlay) return null;

  // `drag-ghost` (globals.css) makes the lifted chip read as grabbing — it's the
  // element under the pointer mid-drag, and overrides the chip's own grab.
  return (
    <div className="drag-ghost">
      <GamerChip
        participationId={overlay.id}
        gamerId={overlay.gamer_id}
        firstName={overlay.gamer_first_name}
        dateOfBirth={overlay.gamer_date_of_birth}
        gender={overlay.gamer_gender}
        parentFirstName={overlay.gamer_parent_first_name}
        parentLastName={overlay.gamer_parent_last_name}
        minecraftUsername={overlay.gamer_minecraft_username}
        minecraftUuid={overlay.gamer_minecraft_uuid}
      />
    </div>
  );
}

// The gamer action in the panel header. At rest it's the "Add gamer" button;
// the moment a gamer chip is being dragged it becomes a destructive "Remove
// gamer" drop zone. The swap is user-initiated (by the drag itself), so it
// doesn't violate the no-in-place-reflow rule. It lives inside the DndContext
// and subscribes to dnd state, so only this node re-renders on pointer move —
// not the whole panel.
function HeaderGamerAction({ onAddGamer }: { onAddGamer: () => void }) {
  const t = useTranslations("admin.products.groupsPanel");
  const { active } = useDndContext();
  const draggingGamer = readGamerDragData(active?.data.current) !== null;

  const { setNodeRef, isOver } = useDroppable({
    id: "remove-gamer-zone",
    data: { remove: true },
  });

  if (draggingGamer) {
    return (
      <div
        ref={setNodeRef}
        className={cn(
          "flex items-center gap-1.5 rounded-md border border-dashed border-destructive px-3 py-1.5 text-sm font-medium text-destructive transition-colors",
          isOver && "bg-destructive/10",
        )}
      >
        <Trash2 className="h-4 w-4" />
        {t("unassigned.removeGamer")}
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={onAddGamer}>
      <UserPlus className="mr-1 h-4 w-4" />
      {t("unassigned.addGamer")}
    </Button>
  );
}

export function GroupsPanel({
  productId,
  productType,
  seatCount,
  waitlistEnabled,
  voiceAvailable,
  voiceIsOpen,
  opensDate,
  opensTime,
}: GroupsPanelProps) {
  const t = useTranslations("admin.products.groupsPanel");
  const { data: snapshot, isLoading } = useProductGroups(productId);
  const pending = useGroupPending(productId);

  const move = useMoveParticipation(productId);
  const rename = useRenameGroup(productId);
  const createGroup = useCreateGroup(productId);
  const addGedu = useAddGedu(productId);
  const removeGedu = useRemoveGedu(productId);
  const deleteGroup = useDeleteGroup(productId);
  const addGamer = useAdminAddGamerToProduct(productId);
  const removeGamer = useAdminRemoveGamerFromProduct(productId);
  const promote = usePromoteFromWaitlist(productId);
  const demote = useDemoteToWaitlist(productId);

  const [pickerForGroupId, setPickerForGroupId] = useState<string | null>(null);
  const [gamerPickerOpen, setGamerPickerOpen] = useState(false);
  // The gamer pending removal-confirmation (id + name for the dialog copy), or
  // null when the confirm dialog is closed. The mutation only fires on confirm.
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(
    null,
  );

  // Recurring billing on consumer clubs makes a no-payment comp awkward, so
  // the Add Gamer affordance is hidden for that product type. Route enforces
  // this too (defense in depth). The waitlist section is hidden for the same
  // reason — a consumer-club waitlister can't be promoted without a Stripe
  // subscription, and the create UI already blocks waitlists on consumer clubs.
  const canAddGamer = productType !== "consumer_club";
  const showWaitlist = productType !== "consumer_club";

  // Any enrolled gamer blocks a re-add via the picker.
  const enrolledGamerIds = useMemo(() => {
    const ids = new Set<string>();
    if (!snapshot) return ids;
    for (const g of snapshot.groups) {
      for (const p of g.participations) ids.add(p.gamer_id);
    }
    for (const p of snapshot.unassigned) ids.add(p.gamer_id);
    return ids;
  }, [snapshot]);

  // One Gedu per product (DB unique constraint), so the picker excludes anyone
  // already assigned to any group. Removals aren't optimistic, so a Gedu mid-
  // removal stays excluded until the settle refetch — correct.
  const allAssignedGeduIds = useMemo(() => {
    if (!snapshot) return [];
    const ids = new Set<string>();
    for (const g of snapshot.groups) {
      for (const ge of g.gedus) ids.add(ge.id);
    }
    return Array.from(ids);
  }, [snapshot]);

  // Where each participation currently lives, to recognize a drop back onto the
  // same column as a no-op (skip the round-trip mutation entirely).
  const placementById = useMemo(() => {
    const map = new Map<string, string | null>();
    if (!snapshot) return map;
    for (const g of snapshot.groups) {
      for (const p of g.participations) map.set(p.id, g.id);
    }
    for (const p of snapshot.unassigned) map.set(p.id, null);
    return map;
  }, [snapshot]);

  // Which chips are waitlisted — decides promote (waitlisted → group/unassigned)
  // vs an ordinary move, and demote (active → waitlist) vs a no-op.
  const waitlistedIds = useMemo(() => {
    return new Set((snapshot?.waitlist ?? []).map((p) => p.id));
  }, [snapshot]);

  // Seats taken = every active participation (groups + unassigned; the snapshot
  // only ever holds active rows there). Drives the seat-availability bar and the
  // promote dialog's over-capacity warning, from the one snapshot source.
  const activeCount = useMemo(() => {
    if (!snapshot) return 0;
    return (
      snapshot.groups.reduce((n, g) => n + g.participations.length, 0) +
      snapshot.unassigned.length
    );
  }, [snapshot]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { over, active } = event;
    if (!over) return;

    const dragData = readGamerDragData(active.data.current);
    const dropData = readDropData(over.data.current);
    if (!dragData || !dropData) return;

    if (dropData.kind === "remove") {
      // Admin removal is a hard delete with no refund — confirm before
      // mutating. Stash the chip's identity for the dialog copy; the mutation
      // fires only when the admin confirms.
      setRemoving({ id: dragData.participationId, name: dragData.firstName });
      return;
    }

    const isWaitlisted = waitlistedIds.has(dragData.participationId);

    if (dropData.kind === "waitlist") {
      // Dropping onto the waitlist demotes an active gamer to the back of the
      // line. A chip already on the waitlist is a no-op.
      if (isWaitlisted) return;
      demote.mutate({ participationId: dragData.participationId });
      return;
    }

    // dropData.kind === "move": a group column or the unassigned inbox.
    if (isWaitlisted) {
      // Promote the waitlisted gamer straight into the drop target — give them a
      // seat. No confirm: the live seat bar already shows the admin where the
      // club's capacity stands, and the action is reversible (demote).
      promote.mutate({
        participationId: dragData.participationId,
        toGroupId: dropData.toGroupId,
      });
      return;
    }

    const current = placementById.get(dragData.participationId) ?? null;
    if (current === dropData.toGroupId) return; // dropped back where it started

    move.mutate({
      participationId: dragData.participationId,
      toGroupId: dropData.toGroupId,
    });
  };

  const handleAddGroup = () => {
    // Default name: "Group A", "Group B", … indexed by the current group count
    // (which includes any optimistic cards already on screen).
    const liveCount = snapshot?.groups.length ?? 0;
    const letter = String.fromCharCode(65 + liveCount);
    createGroup.mutate({ name: t("group.defaultName", { letter }) });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            {t("title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="h-20 animate-pulse rounded-lg bg-muted" />
            <div className="h-20 animate-pulse rounded-lg bg-muted" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const groups = snapshot?.groups ?? [];
  const unassigned = snapshot?.unassigned ?? [];
  const waitlist = snapshot?.waitlist ?? [];
  const hasGroups = groups.length > 0;

  // Capacity context. The bar renders nothing when uncapped (seatCount null);
  // when full or over-filled it simply reads "0 remaining" — admins promoting
  // over the cap do so deliberately, so we don't special-case over-capacity.
  const seatsLeft = seatCount !== null ? Math.max(0, seatCount - activeCount) : 0;

  // Greyed/undraggable chips: an in-flight move/promote/demote OR removal.
  const busyChipIds = new Set<string>([...pending.moves, ...pending.removes]);

  return (
    <div className="space-y-3">
      {/* The header is inside the DndContext so the "Add gamer" button can swap
          to a "Remove gamer" drop zone mid-drag (HeaderGamerAction). The picker
          sheets are deliberately kept OUTSIDE it — see the note below. */}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex flex-row items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Users className="h-5 w-5 text-muted-foreground" />
              {t("title")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            {canAddGamer && (
              <HeaderGamerAction onAddGamer={() => setGamerPickerOpen(true)} />
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddGroup}
              disabled={createGroup.isPending}
            >
              <Plus className="mr-1 h-4 w-4" />
              {t("addGroup")}
            </Button>
          </div>
        </div>

        {/* Capacity context — the same bar the shop shows, fed from the live
            snapshot's active count. Renders nothing for uncapped products. */}
        <SeatAvailabilityBar
          seatCount={seatCount}
          seatsLeft={seatsLeft}
          waitlistEnabled={waitlistEnabled}
        />

        <div className="space-y-3">
          <UnassignedCard
            participations={unassigned}
            pendingChipIds={busyChipIds}
          />

          {hasGroups ? (
            groups.map((g) => (
              <GroupColumn
                key={g.id}
                group={g}
                pending={pending}
                voiceAvailable={voiceAvailable}
                voiceIsOpen={voiceIsOpen}
                opensDate={opensDate}
                opensTime={opensTime}
                onRename={(groupId, name) => rename.mutate({ groupId, name })}
                onDelete={(groupId) => deleteGroup.mutate({ groupId })}
                onAddGedu={(groupId) => setPickerForGroupId(groupId)}
                onRemoveGedu={(groupId, geduId) =>
                  removeGedu.mutate({ groupId, geduId })
                }
              />
            ))
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center">
                <p className="text-sm font-medium">{t("empty.title")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("empty.description")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={handleAddGroup}
                  disabled={createGroup.isPending}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  {t("empty.addFirst")}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Waitlist — hidden for consumer clubs (no waitlist there). Inside
              the DndContext so its chips can be dragged out to promote/remove
              and active gamers can be dropped in to demote. */}
          {showWaitlist && (
            <WaitlistCard
              participations={waitlist}
              pendingChipIds={busyChipIds}
            />
          )}
        </div>

        <DragOverlay>
          <DragOverlayContent snapshot={snapshot} />
        </DragOverlay>
      </DndContext>

      {/* GamerPickerSheet and GeduPickerSheet are deliberately rendered
          OUTSIDE the DndContext above. dnd-kit re-renders subscribed children
          on every pointer move during a drag, so a heavy always-mounted
          subtree under it would tank drag responsiveness. Keep these as
          siblings of the DndContext, not children. */}
      <GamerPickerSheet
        open={gamerPickerOpen}
        onOpenChange={setGamerPickerOpen}
        enrolledGamerIds={enrolledGamerIds}
        onAddGamer={async (gamerId) => {
          await addGamer.mutateAsync(gamerId);
        }}
      />

      <GeduPickerSheet
        open={pickerForGroupId !== null}
        onOpenChange={(open) => {
          if (!open) setPickerForGroupId(null);
        }}
        title={t("picker.addTitle", {
          name: groups.find((g) => g.id === pickerForGroupId)?.name ?? "",
        })}
        description={t("picker.addDescription")}
        excludeIds={allAssignedGeduIds}
        onSelect={(gedu) => {
          if (!pickerForGroupId) return;
          addGedu.mutate({
            groupId: pickerForGroupId,
            geduId: gedu.id,
            firstName: gedu.first_name,
            email: gedu.email,
          });
          setPickerForGroupId(null);
        }}
      />

      {removing && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setRemoving(null);
          }}
          title={t("removeGamer.confirmTitle", { name: removing.name })}
          description={t("removeGamer.confirmDescription", {
            name: removing.name,
          })}
          confirmLabel={t("removeGamer.confirmCta")}
          onConfirm={() => removeGamer.mutate({ participationId: removing.id })}
        >
          <div className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 px-3 py-2.5 text-sm font-semibold text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{t("removeGamer.noRefundWarning")}</span>
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}
