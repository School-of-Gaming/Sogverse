"use client";

import { useMemo, useReducer } from "react";
import type {
  GroupV2GeduDetail,
  GroupV2ParticipationDetail,
  ProductGroupsV2Snapshot,
  ProductGroupV2WithDetails,
} from "@/types";
import type { BatchGroupChangesV2 } from "@/services/groups-v2";

// ---------------------------------------------------------------------------
// Staged change types
// ---------------------------------------------------------------------------

/** A Gedu staged for assignment — carries display details so the UI can
 * show real names (not "Unknown") for Gedus who aren't yet on the server
 * snapshot for this product. */
interface PendingGedu {
  id: string;
  firstName: string;
  email: string | null;
}

interface AddedGroupV2 {
  tempId: string;
  name: string;
  /** Gedus added inline at group creation time. */
  gedus: PendingGedu[];
}

interface RenamedGroup {
  groupId: string;
  name: string;
}

interface AssignmentAdd {
  groupId: string;
  geduId: string;
  firstName: string;
  email: string | null;
}

interface AssignmentRemove {
  groupId: string;
  geduId: string;
}

interface ParticipationMove {
  participationId: string;
  /** Real UUID, tempId for a new group, or null for the unassigned inbox. */
  toGroupId: string | null;
}

interface GroupEditorV2State {
  addedGroups: AddedGroupV2[];
  renamedGroups: RenamedGroup[];
  deletedGroupIds: string[];
  geduAssignmentsAdded: AssignmentAdd[];
  geduAssignmentsRemoved: AssignmentRemove[];
  participationMoves: ParticipationMove[];
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type GroupEditorV2Action =
  | { type: "ADD_GROUP"; name: string; gedus?: PendingGedu[] }
  | { type: "RENAME_GROUP"; groupId: string; name: string }
  | { type: "DELETE_GROUP"; groupId: string }
  | {
      type: "ADD_GEDU";
      groupId: string;
      geduId: string;
      firstName: string;
      email: string | null;
    }
  | { type: "REMOVE_GEDU"; groupId: string; geduId: string }
  | {
      type: "MOVE_PARTICIPATION";
      participationId: string;
      toGroupId: string | null;
      /** Where the participation lives on the server. Used to detect no-op
       * round-trip drags (back to the original location) and cancel any
       * previously staged move for this participation. */
      serverGroupId: string | null;
    }
  | { type: "RESET" };

// Module-level temp id counter — temp ids are ephemeral and only need to be
// unique within a single edit session. The RPC maps them to real UUIDs at
// commit time.
let tempIdCounter = 0;

const TEMP_PREFIX = "temp-";

const isTempId = (id: string): boolean => id.startsWith(TEMP_PREFIX);

/** @visibleForTesting */
export const initialState: GroupEditorV2State = {
  addedGroups: [],
  renamedGroups: [],
  deletedGroupIds: [],
  geduAssignmentsAdded: [],
  geduAssignmentsRemoved: [],
  participationMoves: [],
};

/** @visibleForTesting */
export function reducer(
  state: GroupEditorV2State,
  action: GroupEditorV2Action,
): GroupEditorV2State {
  switch (action.type) {
    case "ADD_GROUP": {
      const tempId = `${TEMP_PREFIX}${++tempIdCounter}`;
      return {
        ...state,
        addedGroups: [
          ...state.addedGroups,
          { tempId, name: action.name, gedus: action.gedus ?? [] },
        ],
      };
    }

    case "RENAME_GROUP": {
      // Rename of a newly-added group → mutate addedGroups.
      if (isTempId(action.groupId)) {
        return {
          ...state,
          addedGroups: state.addedGroups.map((g) =>
            g.tempId === action.groupId ? { ...g, name: action.name } : g,
          ),
        };
      }

      // Rename of an existing group → upsert in renamedGroups.
      const idx = state.renamedGroups.findIndex(
        (r) => r.groupId === action.groupId,
      );
      if (idx === -1) {
        return {
          ...state,
          renamedGroups: [
            ...state.renamedGroups,
            { groupId: action.groupId, name: action.name },
          ],
        };
      }
      const next = state.renamedGroups.slice();
      next[idx] = { groupId: action.groupId, name: action.name };
      return { ...state, renamedGroups: next };
    }

    case "DELETE_GROUP": {
      // Deleting a newly-added group → just drop it from addedGroups, and
      // strip any pending assignments / moves that referenced it.
      if (isTempId(action.groupId)) {
        return {
          ...state,
          addedGroups: state.addedGroups.filter(
            (g) => g.tempId !== action.groupId,
          ),
          geduAssignmentsAdded: state.geduAssignmentsAdded.filter(
            (a) => a.groupId !== action.groupId,
          ),
          geduAssignmentsRemoved: state.geduAssignmentsRemoved.filter(
            (a) => a.groupId !== action.groupId,
          ),
          participationMoves: state.participationMoves.filter(
            (m) => m.toGroupId !== action.groupId,
          ),
        };
      }

      // Deleting an existing group: any participations targeting it become
      // unassigned (the DB does this via ON DELETE SET NULL, but we mirror
      // here so the UI shows the right state pre-commit). Pending Gedu
      // assignments to/from this group are also dropped.
      return {
        ...state,
        deletedGroupIds: [...state.deletedGroupIds, action.groupId],
        renamedGroups: state.renamedGroups.filter(
          (r) => r.groupId !== action.groupId,
        ),
        geduAssignmentsAdded: state.geduAssignmentsAdded.filter(
          (a) => a.groupId !== action.groupId,
        ),
        geduAssignmentsRemoved: state.geduAssignmentsRemoved.filter(
          (a) => a.groupId !== action.groupId,
        ),
        // Strip moves INTO the deleted group; moves OUT of it stay (a gamer
        // who was being moved out will land in their destination, and a gamer
        // already in the deleted group will fall through to unassigned via
        // computeEffectiveSnapshot).
        participationMoves: state.participationMoves.filter(
          (m) => m.toGroupId !== action.groupId,
        ),
      };
    }

    case "ADD_GEDU": {
      // Adding a Gedu to a newly-added group → mutate that group's Gedu list.
      if (isTempId(action.groupId)) {
        return {
          ...state,
          addedGroups: state.addedGroups.map((g) => {
            if (g.tempId !== action.groupId) return g;
            if (g.gedus.some((ge) => ge.id === action.geduId)) return g;
            return {
              ...g,
              gedus: [
                ...g.gedus,
                {
                  id: action.geduId,
                  firstName: action.firstName,
                  email: action.email,
                },
              ],
            };
          }),
        };
      }

      // If we previously staged a removal of this same (group, gedu), undo it
      // rather than recording a redundant add.
      const removalIdx = state.geduAssignmentsRemoved.findIndex(
        (a) =>
          a.groupId === action.groupId && a.geduId === action.geduId,
      );
      if (removalIdx !== -1) {
        return {
          ...state,
          geduAssignmentsRemoved: state.geduAssignmentsRemoved.filter(
            (_, i) => i !== removalIdx,
          ),
        };
      }

      // Already staged? Idempotent.
      const exists = state.geduAssignmentsAdded.some(
        (a) =>
          a.groupId === action.groupId && a.geduId === action.geduId,
      );
      if (exists) return state;

      return {
        ...state,
        geduAssignmentsAdded: [
          ...state.geduAssignmentsAdded,
          {
            groupId: action.groupId,
            geduId: action.geduId,
            firstName: action.firstName,
            email: action.email,
          },
        ],
      };
    }

    case "REMOVE_GEDU": {
      // Removing from a newly-added group → drop from its Gedu list.
      if (isTempId(action.groupId)) {
        return {
          ...state,
          addedGroups: state.addedGroups.map((g) =>
            g.tempId === action.groupId
              ? { ...g, gedus: g.gedus.filter((ge) => ge.id !== action.geduId) }
              : g,
          ),
        };
      }

      // If we previously staged an add of this same (group, gedu), undo it
      // instead of recording a redundant remove.
      const addIdx = state.geduAssignmentsAdded.findIndex(
        (a) => a.groupId === action.groupId && a.geduId === action.geduId,
      );
      if (addIdx !== -1) {
        return {
          ...state,
          geduAssignmentsAdded: state.geduAssignmentsAdded.filter(
            (_, i) => i !== addIdx,
          ),
        };
      }

      // Already staged? Idempotent.
      const exists = state.geduAssignmentsRemoved.some(
        (a) => a.groupId === action.groupId && a.geduId === action.geduId,
      );
      if (exists) return state;

      return {
        ...state,
        geduAssignmentsRemoved: [
          ...state.geduAssignmentsRemoved,
          { groupId: action.groupId, geduId: action.geduId },
        ],
      };
    }

    case "MOVE_PARTICIPATION": {
      const idx = state.participationMoves.findIndex(
        (m) => m.participationId === action.participationId,
      );

      // Round-trip: dropping back where the server already has this
      // participation. Drop any previously staged move; if none was staged,
      // this is a true no-op (drag onto the same column without any prior
      // movement) and the state shouldn't change.
      if (action.toGroupId === action.serverGroupId) {
        if (idx === -1) return state;
        return {
          ...state,
          participationMoves: state.participationMoves.filter(
            (_, i) => i !== idx,
          ),
        };
      }

      if (idx === -1) {
        return {
          ...state,
          participationMoves: [
            ...state.participationMoves,
            {
              participationId: action.participationId,
              toGroupId: action.toGroupId,
            },
          ],
        };
      }
      const next = state.participationMoves.slice();
      next[idx] = {
        participationId: action.participationId,
        toGroupId: action.toGroupId,
      };
      return { ...state, participationMoves: next };
    }

    case "RESET":
      return initialState;

    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

// ---------------------------------------------------------------------------
// Effective snapshot — applies staged changes to the server snapshot for
// rendering. Pure function so the UI doesn't have to think about pending vs
// committed state — just render the effective shape.
// ---------------------------------------------------------------------------

export interface EffectiveGroupV2 {
  id: string;
  name: string;
  isNew: boolean;
  isDeleted: boolean;
  /** Pending-removal Gedus carry isPending=false; pending-add Gedus carry isPending=true. */
  gedus: Array<GroupV2GeduDetail & { isPending: boolean; isPendingRemove: boolean }>;
  /** isMoved=true when this participation was moved here in the current edit session. */
  participations: Array<GroupV2ParticipationDetail & { isMoved: boolean }>;
}

export interface EffectiveSnapshot {
  groups: EffectiveGroupV2[];
  unassigned: Array<GroupV2ParticipationDetail & { isMoved: boolean }>;
}

/** @visibleForTesting */
export function computeEffectiveSnapshot(
  server: ProductGroupsV2Snapshot,
  state: GroupEditorV2State,
): EffectiveSnapshot {
  // ---- Build participation lookups -----------------------------------------
  // Where is each participation on the server? Used to decide where moves
  // originate from and to detect whether a "move" is really a no-op.
  const serverParticipationById = new Map<
    string,
    { detail: GroupV2ParticipationDetail; serverGroupId: string | null }
  >();
  for (const g of server.groups) {
    for (const p of g.participations) {
      serverParticipationById.set(p.id, { detail: p, serverGroupId: g.id });
    }
  }
  for (const p of server.unassigned) {
    serverParticipationById.set(p.id, { detail: p, serverGroupId: null });
  }

  const moveByParticipationId = new Map(
    state.participationMoves.map((m) => [m.participationId, m.toGroupId]),
  );

  // Effective placement after applying staged moves AND staged group deletes.
  const effectivePlacement = new Map<string, string | null>();
  for (const [id, info] of serverParticipationById) {
    let placement: string | null = info.serverGroupId;
    if (moveByParticipationId.has(id)) {
      placement = moveByParticipationId.get(id) ?? null;
    }
    // If the placement is a server group that's being deleted, fall through
    // to unassigned (mirrors the DB's ON DELETE SET NULL).
    if (placement && state.deletedGroupIds.includes(placement)) {
      placement = null;
    }
    effectivePlacement.set(id, placement);
  }

  // Helper: was this participation's effective placement different from the
  // server placement? Used for the isMoved chip.
  const isMoved = (id: string): boolean => {
    const info = serverParticipationById.get(id);
    if (!info) return false;
    return effectivePlacement.get(id) !== info.serverGroupId;
  };

  // ---- Build effective groups ----------------------------------------------
  // Build a map of pending Gedu assignments per existing group, with details
  // sourced from anywhere they appear on the server (other groups within the
  // same product).
  const allServerGedus = new Map<string, GroupV2GeduDetail>();
  for (const g of server.groups) {
    for (const ge of g.gedus) {
      allServerGedus.set(ge.id, ge);
    }
  }

  const buildExistingGroup = (
    sg: ProductGroupV2WithDetails,
  ): EffectiveGroupV2 => {
    const isDeleted = state.deletedGroupIds.includes(sg.id);
    const renamed = state.renamedGroups.find((r) => r.groupId === sg.id);

    // Effective Gedu list: server Gedus minus pending removals plus pending adds.
    const removalsForGroup = new Set(
      state.geduAssignmentsRemoved
        .filter((a) => a.groupId === sg.id)
        .map((a) => a.geduId),
    );
    const additionsForGroup = state.geduAssignmentsAdded.filter(
      (a) => a.groupId === sg.id,
    );

    const gedus: EffectiveGroupV2["gedus"] = sg.gedus.map((ge) => ({
      ...ge,
      isPending: false,
      isPendingRemove: removalsForGroup.has(ge.id),
    }));
    for (const add of additionsForGroup) {
      // Prefer the action-supplied details (the picker has the full Profile);
      // fall back to whatever the server snapshot had for this product.
      const detail = allServerGedus.get(add.geduId);
      gedus.push({
        id: add.geduId,
        first_name: add.firstName || (detail?.first_name ?? "Unknown"),
        email: add.email ?? detail?.email ?? null,
        isPending: true,
        isPendingRemove: false,
      });
    }

    // Participations effectively placed in this group.
    const participations: EffectiveGroupV2["participations"] = [];
    for (const [id, placement] of effectivePlacement) {
      if (placement !== sg.id) continue;
      const info = serverParticipationById.get(id)!;
      participations.push({ ...info.detail, isMoved: isMoved(id) });
    }
    participations.sort((a, b) =>
      a.gamer_first_name.localeCompare(b.gamer_first_name),
    );

    return {
      id: sg.id,
      name: renamed?.name ?? sg.name,
      isNew: false,
      isDeleted,
      gedus,
      participations,
    };
  };

  const groups: EffectiveGroupV2[] = server.groups.map(buildExistingGroup);

  for (let i = 0; i < state.addedGroups.length; i++) {
    const ag = state.addedGroups[i];
    const gedus: EffectiveGroupV2["gedus"] = ag.gedus.map((ge) => {
      const detail = allServerGedus.get(ge.id);
      return {
        id: ge.id,
        first_name: ge.firstName || (detail?.first_name ?? "Unknown"),
        email: ge.email ?? detail?.email ?? null,
        isPending: true,
        isPendingRemove: false,
      };
    });

    const participations: EffectiveGroupV2["participations"] = [];
    for (const [id, placement] of effectivePlacement) {
      if (placement !== ag.tempId) continue;
      const info = serverParticipationById.get(id)!;
      participations.push({ ...info.detail, isMoved: true });
    }
    participations.sort((a, b) =>
      a.gamer_first_name.localeCompare(b.gamer_first_name),
    );

    groups.push({
      id: ag.tempId,
      name: ag.name,
      isNew: true,
      isDeleted: false,
      gedus,
      participations,
    });
  }

  // ---- Build unassigned column --------------------------------------------
  const unassigned: EffectiveSnapshot["unassigned"] = [];
  for (const [id, placement] of effectivePlacement) {
    if (placement !== null) continue;
    const info = serverParticipationById.get(id)!;
    unassigned.push({ ...info.detail, isMoved: isMoved(id) });
  }
  unassigned.sort((a, b) => a.signed_up_at.localeCompare(b.signed_up_at));

  return { groups, unassigned };
}

// ---------------------------------------------------------------------------
// Change summary — segments so the UI can highlight names without splitting
// translation strings.
// ---------------------------------------------------------------------------

export type ChangeSegment =
  | { type: "text"; value: string }
  | { type: "group"; value: string }
  | { type: "gedu"; value: string }
  | { type: "gamer"; value: string }
  | { type: "warning"; value: string };

export type ChangeLine = ChangeSegment[];

export interface ChangeSummary {
  lines: ChangeLine[];
  hasChanges: boolean;
}

const text = (value: string): ChangeSegment => ({ type: "text", value });
const group = (value: string): ChangeSegment => ({ type: "group", value });
const gedu = (value: string): ChangeSegment => ({ type: "gedu", value });
const gamer = (value: string): ChangeSegment => ({ type: "gamer", value });

/** @visibleForTesting */
export function buildChangeSummary(
  state: GroupEditorV2State,
  server: ProductGroupsV2Snapshot,
): ChangeSummary {
  const lines: ChangeLine[] = [];

  // Lookups for human names.
  const groupNameById = new Map<string, string>();
  for (const g of server.groups) groupNameById.set(g.id, g.name);
  for (const ag of state.addedGroups) groupNameById.set(ag.tempId, ag.name);
  for (const r of state.renamedGroups) groupNameById.set(r.groupId, r.name);

  const geduNameById = new Map<string, string>();
  for (const g of server.groups) {
    for (const ge of g.gedus) geduNameById.set(ge.id, ge.first_name);
  }
  // Seed staged names too so pending adds for Gedus not yet on this product
  // still render with their real name in the summary.
  for (const ag of state.addedGroups) {
    for (const ge of ag.gedus) geduNameById.set(ge.id, ge.firstName);
  }
  for (const a of state.geduAssignmentsAdded) {
    geduNameById.set(a.geduId, a.firstName);
  }

  const gamerNameByParticipationId = new Map<string, string>();
  for (const g of server.groups) {
    for (const p of g.participations) {
      gamerNameByParticipationId.set(p.id, p.gamer_first_name);
    }
  }
  for (const p of server.unassigned) {
    gamerNameByParticipationId.set(p.id, p.gamer_first_name);
  }

  // Adds first, deletes, renames, gedu changes, then moves — so the summary
  // reads top-down.
  for (const ag of state.addedGroups) {
    if (ag.gedus.length === 0) {
      lines.push([text("Add group "), group(ag.name)]);
    } else {
      const names = ag.gedus.map((ge) => ge.firstName).join(", ");
      lines.push([
        text("Add group "),
        group(ag.name),
        text(" with "),
        gedu(names),
      ]);
    }
  }

  for (const id of state.deletedGroupIds) {
    const name = groupNameById.get(id) ?? "(unknown)";
    lines.push([text("Delete group "), group(name)]);
  }

  for (const r of state.renamedGroups) {
    const previous = server.groups.find((g) => g.id === r.groupId);
    if (!previous) continue;
    if (previous.name === r.name) continue;
    lines.push([
      text("Rename "),
      group(previous.name),
      text(" → "),
      group(r.name),
    ]);
  }

  for (const a of state.geduAssignmentsAdded) {
    const groupName = groupNameById.get(a.groupId) ?? "(unknown)";
    const geduName = geduNameById.get(a.geduId) ?? "(unknown)";
    lines.push([
      text("Assign "),
      gedu(geduName),
      text(" to "),
      group(groupName),
    ]);
  }

  for (const a of state.geduAssignmentsRemoved) {
    const groupName = groupNameById.get(a.groupId) ?? "(unknown)";
    const geduName = geduNameById.get(a.geduId) ?? "(unknown)";
    lines.push([
      text("Remove "),
      gedu(geduName),
      text(" from "),
      group(groupName),
    ]);
  }

  for (const m of state.participationMoves) {
    const gamerName = gamerNameByParticipationId.get(m.participationId);
    if (!gamerName) continue;
    if (m.toGroupId === null) {
      lines.push([text("Send "), gamer(gamerName), text(" to unassigned")]);
    } else {
      const dest = groupNameById.get(m.toGroupId) ?? "(unknown)";
      lines.push([
        text("Move "),
        gamer(gamerName),
        text(" to "),
        group(dest),
      ]);
    }
  }

  return { lines, hasChanges: lines.length > 0 };
}

// ---------------------------------------------------------------------------
// Wire-shape builder — what gets sent to the apply route.
// ---------------------------------------------------------------------------

/** @visibleForTesting */
export function buildBatchPayload(
  state: GroupEditorV2State,
): BatchGroupChangesV2 {
  return {
    addedGroups: state.addedGroups.map((g) => ({
      tempId: g.tempId,
      name: g.name,
      geduIds: g.gedus.map((ge) => ge.id),
    })),
    renamedGroups: state.renamedGroups.map((r) => ({ ...r })),
    deletedGroupIds: [...state.deletedGroupIds],
    // The server contract only needs ids — strip the display fields the
    // client uses for rendering pending pills.
    geduAssignmentsAdded: state.geduAssignmentsAdded.map((a) => ({
      groupId: a.groupId,
      geduId: a.geduId,
    })),
    geduAssignmentsRemoved: state.geduAssignmentsRemoved.map((a) => ({ ...a })),
    participationMoves: state.participationMoves.map((m) => ({ ...m })),
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGroupEditorV2(server: ProductGroupsV2Snapshot | undefined) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const empty = useMemo<ProductGroupsV2Snapshot>(
    () => ({ product_id: "", groups: [], unassigned: [] }),
    [],
  );

  const effective = useMemo(
    () => computeEffectiveSnapshot(server ?? empty, state),
    [server, state, empty],
  );

  const changeSummary = useMemo(
    () => buildChangeSummary(state, server ?? empty),
    [server, state, empty],
  );

  const batchPayload = useMemo(() => buildBatchPayload(state), [state]);

  return {
    state,
    dispatch,
    effective,
    changeSummary,
    batchPayload,
  };
}
