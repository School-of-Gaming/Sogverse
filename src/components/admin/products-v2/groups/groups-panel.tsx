"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDndContext,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Plus, UserPlus, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGroupEditorV2 } from "@/hooks/use-group-editor-v2";
import {
  useAdminAddGamerToProductV2,
  useProductGroupsV2,
} from "@/services/groups-v2";
import { GamerPickerSheetV2 } from "../gamer-picker-sheet-v2";
import { GeduPickerSheetV2 } from "../gedu-picker-sheet-v2";
import { CommitBar } from "./commit-bar";
import { CommitSummaryDialog } from "./commit-summary-dialog";
import { GamerChip } from "./gamer-chip";
import { GroupColumn } from "./group-column";
import { UnassignedCard } from "./unassigned-card";
import type { EffectiveSnapshot } from "@/hooks/use-group-editor-v2";
import type { ProductTypeV2 } from "@/types";

interface GroupsPanelProps {
  productId: string;
  productType: ProductTypeV2;
}

// Renders the chip in the floating overlay during a drag. Reads `active` from
// dnd-kit context so we don't propagate it through props (which would re-render
// the entire panel on every pointer move).
function DragOverlayContent({
  effective,
}: {
  effective: EffectiveSnapshot;
}) {
  const { active } = useDndContext();

  const overlay = useMemo(() => {
    if (!active) return null;
    const data = active.data.current as
      | { participationId: string; gamerId: string; firstName: string }
      | undefined;
    if (!data) return null;

    // Find the participation in the effective snapshot to grab DOB/gender.
    const all = [
      ...effective.unassigned,
      ...effective.groups.flatMap((g) => g.participations),
    ];
    const found = all.find((p) => p.id === data.participationId);
    if (!found) return null;

    return found;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on active?.id rather than the ref-changing `active` object
  }, [active?.id, effective]);

  if (!overlay) return null;

  return (
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
  );
}

export function GroupsPanel({ productId, productType }: GroupsPanelProps) {
  const t = useTranslations("admin.productsV2.groupsPanel");
  const { data: snapshot, isLoading } = useProductGroupsV2(productId);

  const { dispatch, effective, changeSummary, batchPayload } =
    useGroupEditorV2(snapshot);

  const [pickerForGroupId, setPickerForGroupId] = useState<string | null>(null);
  const [gamerPickerOpen, setGamerPickerOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const addGamer = useAdminAddGamerToProductV2(productId);

  // Recurring billing on consumer clubs makes a no-payment comp awkward, so
  // the Add Gamer affordance is hidden for that product type. Route enforces
  // this too (defense in depth).
  const canAddGamer = productType !== "consumer_club";

  // Server snapshot drives the "already added" disabled state inside the
  // picker. The effective snapshot here may include staged moves, but
  // enrollment (any non-reserving participation) is what really blocks a re-add.
  const enrolledGamerIds = useMemo(() => {
    const ids = new Set<string>();
    if (!snapshot) return ids;
    for (const g of snapshot.groups) {
      for (const p of g.participations) ids.add(p.gamer_id);
    }
    for (const p of snapshot.unassigned) ids.add(p.gamer_id);
    return ids;
  }, [snapshot]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Where each participation lives on the server. The reducer needs this to
  // recognize round-trip drags (back to the original column) as no-ops and
  // cancel any previously staged move.
  const serverPlacementById = useMemo(() => {
    const map = new Map<string, string | null>();
    if (!snapshot) return map;
    for (const g of snapshot.groups) {
      for (const p of g.participations) map.set(p.id, g.id);
    }
    for (const p of snapshot.unassigned) map.set(p.id, null);
    return map;
  }, [snapshot]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { over, active } = event;
    if (!over) return;

    const dragData = active.data.current as
      | { participationId: string }
      | undefined;
    const dropData = over.data.current as
      | { toGroupId: string | null }
      | undefined;
    if (!dragData || !dropData) return;

    dispatch({
      type: "MOVE_PARTICIPATION",
      participationId: dragData.participationId,
      toGroupId: dropData.toGroupId,
      serverGroupId: serverPlacementById.get(dragData.participationId) ?? null,
    });
  };

  const handleAddGroup = () => {
    // Default name: "Group A", "Group B", … indexed by current group count.
    // Effective groups gives us the count after staged changes — what the
    // admin will see immediately above the new card.
    const liveCount = effective.groups.filter((g) => !g.isDeleted).length;
    const letter = String.fromCharCode(65 + liveCount);
    dispatch({
      type: "ADD_GROUP",
      name: t("group.defaultName", { letter }),
    });
  };

  // The picker sheet shows for the group the admin clicked "Add Gedu" on.
  // We exclude Gedus already assigned to that group OR to any other group on
  // this product (the unique constraint at the DB level enforces one group
  // per Gedu per product, so the picker reflects that).
  const allAssignedGeduIds = useMemo(() => {
    const ids = new Set<string>();
    for (const g of effective.groups) {
      if (g.isDeleted) continue;
      for (const ge of g.gedus) {
        if (!ge.isPendingRemove) ids.add(ge.id);
      }
    }
    return Array.from(ids);
  }, [effective.groups]);

  // Live groups with blank/whitespace names — block commit until each one
  // gets a real name. The DB rejects via chk_product_groups_v2_name_not_blank,
  // but failing that late means the admin only finds out after clicking Apply.
  const hasBlankNames = effective.groups.some(
    (g) => !g.isDeleted && !g.name.trim(),
  );

  const handleSuccess = () => {
    dispatch({ type: "RESET" });
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

  const hasGroups = effective.groups.length > 0;

  return (
    <div className="space-y-3">
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setGamerPickerOpen(true)}
            >
              <UserPlus className="mr-1 h-4 w-4" />
              {t("unassigned.addGamer")}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleAddGroup}>
            <Plus className="mr-1 h-4 w-4" />
            {t("addGroup")}
          </Button>
        </div>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="space-y-3">
          <UnassignedCard participations={effective.unassigned} />

          {hasGroups ? (
            effective.groups.map((g) => (
              <GroupColumn
                key={g.id}
                group={g}
                onRename={(groupId, name) =>
                  dispatch({ type: "RENAME_GROUP", groupId, name })
                }
                onDelete={(groupId) =>
                  dispatch({ type: "DELETE_GROUP", groupId })
                }
                onAddGedu={(groupId) => setPickerForGroupId(groupId)}
                onRemoveGedu={(groupId, geduId) =>
                  dispatch({ type: "REMOVE_GEDU", groupId, geduId })
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
                >
                  <Plus className="mr-1 h-4 w-4" />
                  {t("empty.addFirst")}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        <DragOverlay>
          <DragOverlayContent effective={effective} />
        </DragOverlay>
      </DndContext>

      <CommitBar
        summary={changeSummary}
        onReview={() => setSummaryOpen(true)}
        onDiscard={() => dispatch({ type: "RESET" })}
        reviewDisabled={hasBlankNames}
        reviewDisabledReason={
          hasBlankNames ? t("group.nameRequiredHint") : undefined
        }
      />

      {/* GamerPickerSheetV2 and GeduPickerSheetV2 are deliberately rendered
          OUTSIDE the DndContext above. dnd-kit re-renders subscribed children
          on every pointer move during a drag, so a heavy always-mounted
          subtree under it would tank drag responsiveness. Keep these as
          siblings of the DndContext, not children. */}
      <GamerPickerSheetV2
        open={gamerPickerOpen}
        onOpenChange={setGamerPickerOpen}
        enrolledGamerIds={enrolledGamerIds}
        onAddGamer={async (gamerId) => {
          await addGamer.mutateAsync(gamerId);
        }}
      />

      <GeduPickerSheetV2
        open={pickerForGroupId !== null}
        onOpenChange={(open) => {
          if (!open) setPickerForGroupId(null);
        }}
        title={t("picker.addTitle", {
          name:
            effective.groups.find((g) => g.id === pickerForGroupId)?.name ?? "",
        })}
        description={t("picker.addDescription")}
        excludeIds={allAssignedGeduIds}
        onSelect={(gedu) => {
          if (!pickerForGroupId) return;
          dispatch({
            type: "ADD_GEDU",
            groupId: pickerForGroupId,
            geduId: gedu.id,
            firstName: gedu.first_name,
            email: gedu.email,
          });
          setPickerForGroupId(null);
        }}
      />

      {summaryOpen && (
        <CommitSummaryDialog
          open
          onOpenChange={setSummaryOpen}
          summary={changeSummary}
          productId={productId}
          batchPayload={batchPayload}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
