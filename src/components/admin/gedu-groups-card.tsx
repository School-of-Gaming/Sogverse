"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Plus, Users, AlertTriangle, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useProductGroups, useCommitGroupChanges } from "@/services/groups";
import { useUsersByRole } from "@/services/users";
import { useGroupEditor } from "@/hooks/use-group-editor";
import { GroupCard } from "./group-card";
import { CommitBar } from "./commit-bar";
import { GeduPickerDialog } from "./gedu-picker-dialog";

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
    message = "This product is hidden. Make it visible so customers can see it.";
    variant = "info";
  } else {
    // visible but no groups — shouldn't normally happen (blocked by UI), but show warning
    message = "This product is visible but has no groups. Customers won't be able to enroll.";
    variant = "warning";
  }

  const Icon = variant === "warning" ? AlertTriangle : Info;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border p-4",
        variant === "warning"
          ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-200"
          : "border-blue-500/30 bg-blue-500/10 text-blue-200",
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// --- Drag overlay ghost chip ---

function DragGhostChip({ displayName }: { displayName: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary shadow-lg">
      {displayName}
    </div>
  );
}

// --- Main component ---

interface GeduGroupsCardProps {
  productId: string;
}

export function GeduGroupsCard({ productId }: GeduGroupsCardProps) {
  const { data: serverGroups = [], isLoading } = useProductGroups(productId);
  const { data: allGedus = [] } = useUsersByRole("gedu");
  const commitMutation = useCommitGroupChanges(productId);

  const { dispatch, effectiveGroups, changeSummary, batchPayload } =
    useGroupEditor(serverGroups);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [activeDrag, setActiveDrag] = useState<{ gamerId: string; displayName: string } | null>(null);

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

  const handleDragStart = (event: DragStartEvent) => {
    const { gamerId, displayName } = event.active.data.current as {
      gamerId: string;
      displayName: string;
    };
    setActiveDrag({ gamerId, displayName });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null);
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

  const handleCommit = () => {
    commitMutation.mutate(batchPayload, {
      onSuccess: () => dispatch({ type: "RESET" }),
    });
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
              onDragStart={handleDragStart}
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
                {activeDrag && <DragGhostChip displayName={activeDrag.displayName} />}
              </DragOverlay>
            </DndContext>
          )}
        </CardContent>
      </Card>

      <CommitBar
        summary={changeSummary}
        onCommit={handleCommit}
        onDiscard={() => dispatch({ type: "RESET" })}
        isPending={commitMutation.isPending}
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
    </>
  );
}
