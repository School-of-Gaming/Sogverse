"use client";

import { useReducer, useMemo } from "react";
import type { ProductGroup, GroupGamer, BatchGroupChanges } from "@/services/groups";

// --- Staged change types ---

interface AddedGroup {
  tempId: string;
  geduId: string;
  geduDisplayName: string;
}

interface UpdatedGroup {
  groupId: string;
  geduId: string;
  geduDisplayName: string;
}

interface EnrollmentMove {
  gamerId: string;
  fromGroupId: string;
  toGroupId: string;
}

interface GroupEditorState {
  addedGroups: AddedGroup[];
  updatedGroups: UpdatedGroup[];
  deletedGroupIds: string[];
  enrollmentMoves: EnrollmentMove[];
}

// --- Actions ---

export type GroupEditorAction =
  | { type: "ADD_GROUP"; geduId: string; geduDisplayName: string }
  | { type: "UPDATE_GROUP_GEDU"; groupId: string; geduId: string; geduDisplayName: string }
  | { type: "DELETE_GROUP"; groupId: string }
  | { type: "MOVE_GAMER"; gamerId: string; fromGroupId: string; toGroupId: string }
  | { type: "RESET" };

// Module-level counter — shared across all hook instances. This is fine
// because temp IDs are ephemeral (mapped to real UUIDs by the RPC) and
// the counter only increments, so IDs never collide.
let tempIdCounter = 0;

/** @visibleForTesting */
export function reducer(state: GroupEditorState, action: GroupEditorAction): GroupEditorState {
  switch (action.type) {
    case "ADD_GROUP": {
      const tempId = `temp-${++tempIdCounter}`;
      return {
        ...state,
        addedGroups: [
          ...state.addedGroups,
          { tempId, geduId: action.geduId, geduDisplayName: action.geduDisplayName },
        ],
      };
    }

    case "UPDATE_GROUP_GEDU": {
      // If it's a newly added group, update in addedGroups
      const addedIdx = state.addedGroups.findIndex((g) => g.tempId === action.groupId);
      if (addedIdx !== -1) {
        const updated = [...state.addedGroups];
        updated[addedIdx] = {
          ...updated[addedIdx],
          geduId: action.geduId,
          geduDisplayName: action.geduDisplayName,
        };
        return { ...state, addedGroups: updated };
      }

      // Otherwise, track as an update to an existing group
      const existingIdx = state.updatedGroups.findIndex((g) => g.groupId === action.groupId);
      if (existingIdx !== -1) {
        const updated = [...state.updatedGroups];
        updated[existingIdx] = {
          groupId: action.groupId,
          geduId: action.geduId,
          geduDisplayName: action.geduDisplayName,
        };
        return { ...state, updatedGroups: updated };
      }

      return {
        ...state,
        updatedGroups: [
          ...state.updatedGroups,
          { groupId: action.groupId, geduId: action.geduId, geduDisplayName: action.geduDisplayName },
        ],
      };
    }

    case "DELETE_GROUP": {
      // If it's a newly added group, just remove from addedGroups
      const addedIdx = state.addedGroups.findIndex((g) => g.tempId === action.groupId);
      if (addedIdx !== -1) {
        // Also remove any moves involving this temp group
        return {
          ...state,
          addedGroups: state.addedGroups.filter((g) => g.tempId !== action.groupId),
          enrollmentMoves: state.enrollmentMoves.filter(
            (m) => m.fromGroupId !== action.groupId && m.toGroupId !== action.groupId,
          ),
        };
      }

      // Otherwise mark for deletion and clean up related updates/moves.
      // Keep moves OUT of the deleted group (gamers still land in their destination)
      // but remove moves INTO it (destination no longer exists).
      return {
        ...state,
        deletedGroupIds: [...state.deletedGroupIds, action.groupId],
        updatedGroups: state.updatedGroups.filter((g) => g.groupId !== action.groupId),
        enrollmentMoves: state.enrollmentMoves.filter(
          (m) => m.toGroupId !== action.groupId,
        ),
      };
    }

    case "MOVE_GAMER": {
      if (action.fromGroupId === action.toGroupId) return state;

      // Check if there's already a move for this gamer — update it or cancel it
      const existingIdx = state.enrollmentMoves.findIndex(
        (m) => m.gamerId === action.gamerId,
      );

      if (existingIdx !== -1) {
        const existing = state.enrollmentMoves[existingIdx];
        // If moving back to original group, cancel the move
        if (existing.fromGroupId === action.toGroupId) {
          return {
            ...state,
            enrollmentMoves: state.enrollmentMoves.filter((_, i) => i !== existingIdx),
          };
        }
        // Otherwise update the destination
        const updated = [...state.enrollmentMoves];
        updated[existingIdx] = {
          ...existing,
          toGroupId: action.toGroupId,
        };
        return { ...state, enrollmentMoves: updated };
      }

      return {
        ...state,
        enrollmentMoves: [
          ...state.enrollmentMoves,
          {
            gamerId: action.gamerId,
            fromGroupId: action.fromGroupId,
            toGroupId: action.toGroupId,
          },
        ],
      };
    }

    case "RESET":
      return { addedGroups: [], updatedGroups: [], deletedGroupIds: [], enrollmentMoves: [] };

    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

/** @visibleForTesting */
export const initialState: GroupEditorState = {
  addedGroups: [],
  updatedGroups: [],
  deletedGroupIds: [],
  enrollmentMoves: [],
};

// --- Effective groups computation ---

export interface EffectiveGroup {
  /** Real UUID or temp-xxx for new groups */
  id: string;
  geduId: string;
  geduDisplayName: string;
  displayOrder: number;
  isNew: boolean;
  isDeleted: boolean;
  gamers: Array<GroupGamer & { isMoved?: boolean }>;
}

/** @visibleForTesting */
export function computeEffectiveGroups(
  serverGroups: ProductGroup[],
  state: GroupEditorState,
): EffectiveGroup[] {
  const groups: EffectiveGroup[] = [];

  // Build a lookup of all gamers across all server groups
  const gamerLookup = new Map<string, GroupGamer>();
  for (const sg of serverGroups) {
    for (const g of sg.gamers) {
      gamerLookup.set(g.gamerId, g);
    }
  }

  // Start with server groups
  for (const sg of serverGroups) {
    const isDeleted = state.deletedGroupIds.includes(sg.groupId);
    const update = state.updatedGroups.find((u) => u.groupId === sg.groupId);

    // Deleted groups show no gamers — they've been moved elsewhere or will be unenrolled
    let gamers: EffectiveGroup["gamers"] = [];

    if (!isDeleted) {
      // Compute effective gamers after moves
      gamers = sg.gamers.map((g) => ({ ...g, isMoved: false }));

      // Remove gamers that were moved out
      const movedOut = state.enrollmentMoves
        .filter((m) => m.fromGroupId === sg.groupId)
        .map((m) => m.gamerId);
      gamers = gamers.filter((g) => !movedOut.includes(g.gamerId));

      // Add gamers that were moved in
      const movedIn = state.enrollmentMoves.filter((m) => m.toGroupId === sg.groupId);
      for (const move of movedIn) {
        const gamer = gamerLookup.get(move.gamerId);
        gamers.push({
          gamerId: move.gamerId,
          displayName: gamer?.displayName ?? "Unknown",
          enrollmentId: "",
          dateOfBirth: gamer?.dateOfBirth ?? null,
          gender: gamer?.gender ?? null,
          isMoved: true,
        });
      }
    }

    groups.push({
      id: sg.groupId,
      geduId: update ? update.geduId : sg.geduId,
      geduDisplayName: update ? update.geduDisplayName : sg.geduDisplayName,
      displayOrder: sg.displayOrder,
      isNew: false,
      isDeleted,
      gamers,
    });
  }

  // Add new groups
  for (let i = 0; i < state.addedGroups.length; i++) {
    const ag = state.addedGroups[i];
    const movedIn = state.enrollmentMoves.filter((m) => m.toGroupId === ag.tempId);
    groups.push({
      id: ag.tempId,
      geduId: ag.geduId,
      geduDisplayName: ag.geduDisplayName,
      displayOrder: serverGroups.length + i,
      isNew: true,
      isDeleted: false,
      gamers: movedIn.map((m) => {
        const gamer = gamerLookup.get(m.gamerId);
        return {
          gamerId: m.gamerId,
          displayName: gamer?.displayName ?? "Unknown",
          enrollmentId: "",
          dateOfBirth: gamer?.dateOfBirth ?? null,
          gender: gamer?.gender ?? null,
          isMoved: true,
        };
      }),
    });
  }

  return groups;
}

// --- Change summary ---

export type ChangeSegment =
  | { type: "text"; value: string }
  | { type: "gamer"; value: string }
  | { type: "gedu"; value: string }
  | { type: "warning"; value: string };

export type ChangeLine = ChangeSegment[];

export interface ChangeSummary {
  lines: ChangeLine[];
  hasChanges: boolean;
}

// Helpers for building segment arrays
const text = (value: string): ChangeSegment => ({ type: "text", value });
const gamer = (value: string): ChangeSegment => ({ type: "gamer", value });
const gedu = (value: string): ChangeSegment => ({ type: "gedu", value });

/** @visibleForTesting */
export function buildChangeSummary(
  state: GroupEditorState,
  serverGroups: ProductGroup[],
): ChangeSummary {
  const lines: ChangeLine[] = [];

  for (const g of state.addedGroups) {
    lines.push([text("Add group with "), gedu(g.geduDisplayName)]);
  }
  for (const g of state.updatedGroups) {
    const prev = serverGroups.find((sg) => sg.groupId === g.groupId);
    const from = prev?.geduDisplayName ?? "unknown";
    lines.push([
      text("Reassign "), gedu(from), text("'s group to "), gedu(g.geduDisplayName),
    ]);
  }
  for (const id of state.deletedGroupIds) {
    const sg = serverGroups.find((g) => g.groupId === id);
    const name = sg?.geduDisplayName ?? "unknown";
    lines.push([text("Delete "), gedu(name), text("'s group")]);
  }

  // Build lookups for move descriptions
  const gamerLookup = new Map<string, string>();
  const groupGeduLookup = new Map<string, string>();
  for (const sg of serverGroups) {
    groupGeduLookup.set(sg.groupId, sg.geduDisplayName);
    for (const g of sg.gamers) {
      gamerLookup.set(g.gamerId, g.displayName);
    }
  }
  for (const ag of state.addedGroups) {
    groupGeduLookup.set(ag.tempId, ag.geduDisplayName);
  }
  for (const m of state.enrollmentMoves) {
    const name = gamerLookup.get(m.gamerId) ?? "a gamer";
    const from = groupGeduLookup.get(m.fromGroupId) ?? "unknown";
    const to = groupGeduLookup.get(m.toGroupId) ?? "unknown";
    lines.push([
      text("Move "), gamer(name),
      text(" from "), gedu(from), text("'s group"),
      text(" to "), gedu(to), text("'s group"),
    ]);
  }

  // Warn if all groups will be removed (product will be auto-hidden)
  const survivingServerGroups = serverGroups.length - state.deletedGroupIds.length;
  if (survivingServerGroups + state.addedGroups.length === 0 && serverGroups.length > 0) {
    lines.push([{ type: "warning", value: "Product will be automatically hidden (no groups remaining)" }]);
  }

  return { lines, hasChanges: lines.length > 0 };
}

// --- Hook ---

export function useGroupEditor(serverGroups: ProductGroup[]) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const effectiveGroups = useMemo(
    () => computeEffectiveGroups(serverGroups, state),
    [serverGroups, state],
  );

  const changeSummary = useMemo(
    () => buildChangeSummary(state, serverGroups),
    [state, serverGroups],
  );

  const batchPayload: BatchGroupChanges = useMemo(
    () => ({
      addedGroups: state.addedGroups.map((g) => ({ tempId: g.tempId, geduId: g.geduId })),
      updatedGroups: state.updatedGroups.map((g) => ({ groupId: g.groupId, geduId: g.geduId })),
      deletedGroupIds: state.deletedGroupIds,
      enrollmentMoves: state.enrollmentMoves.map((m) => ({
        gamerId: m.gamerId,
        fromGroupId: m.fromGroupId,
        toGroupId: m.toGroupId,
      })),
    }),
    [state],
  );

  return {
    state,
    dispatch,
    effectiveGroups,
    changeSummary,
    batchPayload,
  };
}
