"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDndContext,
} from "@dnd-kit/core";
import { Plus, Users, AlertTriangle, Info } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProductGroups, groupKeys } from "@/services/groups";
import { useUsersByRole } from "@/services/users";
import { useGroupEditor, type EffectiveGroup } from "@/hooks/use-group-editor";
import { GroupCard, EnrolledGamerChip } from "./group-card";
import { CommitBar } from "./commit-bar";
import { GeduPickerDialog } from "./gedu-picker-dialog";
import { CommitFlowDialog } from "./commit-flow-dialog";

// --- Visibility warning banner ---

interface VisibilityWarningBannerProps {
  isVisible: boolean;
  groupCount: number;
}

export function VisibilityWarningBanner({ isVisible, groupCount }: VisibilityWarningBannerProps) {
  if (isVisible && groupCount > 0) return null;

  let message: string;
  let variant: "warning" | "info";

  if (!isVisible && groupCount === 0) {
    message = "This product is hidden and has no groups assigned. Add groups before making it visible.";
    variant = "warning";
  } else if (!isVisible && groupCount > 0) {
    message = "This product is hidden. Make it visible so parents can see it.";
    variant = "info";
  } else {
    // visible but no groups — shouldn't normally happen (blocked by UI), but show warning
    message = "This product is visible but has no groups. Parents won't be able to enroll.";
    variant = "warning";
  }

  const Icon = variant === "warning" ? AlertTriangle : Info;

  return (
    <Alert variant={variant}>
      <Icon className="h-4 w-4" />
      <p>{message}</p>
    </Alert>
  );
}

// --- Drag overlay (reads active drag from DndContext, avoids parent state) ---

function DragOverlayContent({ effectiveGroups }: { effectiveGroups: EffectiveGroup[] }) {
  const { active } = useDndContext();

  // Resolve gamer data once per drag (active.id is stable for the drag
  // lifetime), not on every pointer-move context update.
  const overlayChip = useMemo(() => {
    if (!active) return null;
    const { gamerId, fromGroupId } = active.data.current as {
      gamerId: string;
      fromGroupId: string;
    };
    const group = effectiveGroups.find((g) => g.id === fromGroupId);
    const gamer = group?.gamers.find((g) => g.gamerId === gamerId);
    if (!gamer) return null;
    return { gamer, fromGroupId };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on active?.id, not `active` (dnd-kit changes the object ref on every pointer move)
  }, [active?.id, effectiveGroups]);

  if (!overlayChip) return null;

  const { gamer, fromGroupId } = overlayChip;
  return (
    <EnrolledGamerChip
      gamerId={gamer.gamerId}
      displayName={gamer.displayName}
      dateOfBirth={gamer.dateOfBirth}
      gender={gamer.gender}
      groupId={fromGroupId}
    />
  );
}

// --- Main component ---

interface GeduGroupsCardProps {
  productId: string;
}

export function GeduGroupsCard({ productId }: GeduGroupsCardProps) {
  const queryClient = useQueryClient();
  const { data: serverGroups = [], isLoading } = useProductGroups(productId);
  const { data: allGedus = [] } = useUsersByRole("gedu");

  const { dispatch, effectiveGroups, changeSummary, batchPayload, notifyPayload } =
    useGroupEditor(serverGroups);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Compute which gedu IDs are already used (including staged additions)
  const usedGeduIds = effectiveGroups
    .filter((g) => !g.isDeleted)
    .map((g) => g.geduId);

  // Build label index — only non-deleted groups get numbered
  const activeGroups = effectiveGroups.filter((g) => !g.isDeleted);

  function getGroupLabel(groupId: string): string {
    const idx = activeGroups.findIndex((g) => g.id === groupId);
    if (idx === -1) return "Group";
    return `Group ${idx + 1}`;
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { over, active } = event;
    if (!over) return;

    const { gamerId, fromGroupId } = active.data.current as {
      gamerId: string;
      displayName: string;
      fromGroupId: string;
    };
    const { groupId: toGroupId } = over.data.current as { groupId: string };

    if (fromGroupId === toGroupId) return;

    dispatch({
      type: "MOVE_GAMER",
      gamerId,
      fromGroupId,
      toGroupId,
    });
  };

  const handleComplete = () => {
    dispatch({ type: "RESET" });
    queryClient.invalidateQueries({ queryKey: groupKeys.byProduct(productId) });
    queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            Gedu Groups
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

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            Gedu Groups
            {activeGroups.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {activeGroups.length}
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add Group
          </Button>
        </CardHeader>
        <CardContent>
          {effectiveGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No groups yet. Add a group to assign a gedu.
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              onDragEnd={handleDragEnd}
            >
              <div className="space-y-3">
                {effectiveGroups.map((group) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    groupLabel={
                      group.isDeleted
                        ? `${getGroupLabel(group.id)} (deleted)`
                        : getGroupLabel(group.id)
                    }
                    gedus={allGedus}
                    usedGeduIds={usedGeduIds}
                    onDelete={(id) => {
                      const g = effectiveGroups.find((eg) => eg.id === id);
                      if (g && g.gamers.length > 0) return;
                      dispatch({ type: "DELETE_GROUP", groupId: id });
                    }}
                    onReassignGedu={(id, geduId, geduDisplayName) =>
                      dispatch({
                        type: "UPDATE_GROUP_GEDU",
                        groupId: id,
                        geduId,
                        geduDisplayName,
                      })
                    }
                  />
                ))}
              </div>
              <DragOverlay>
                <DragOverlayContent effectiveGroups={effectiveGroups} />
              </DragOverlay>
            </DndContext>
          )}
        </CardContent>
      </Card>

      <CommitBar
        summary={changeSummary}
        onReview={() => setCommitDialogOpen(true)}
        onDiscard={() => dispatch({ type: "RESET" })}
      />

      <GeduPickerDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        title="Add Group"
        description="Select a gedu to assign to the new group."
        gedus={allGedus}
        excludeIds={usedGeduIds}
        onSelect={(geduId, geduDisplayName) =>
          dispatch({ type: "ADD_GROUP", geduId, geduDisplayName })
        }
      />

      <CommitFlowDialog
        open={commitDialogOpen}
        onOpenChange={setCommitDialogOpen}
        summary={changeSummary}
        productId={productId}
        batchPayload={batchPayload}
        notifyPayload={notifyPayload}
        onComplete={handleComplete}
      />
    </>
  );
}
