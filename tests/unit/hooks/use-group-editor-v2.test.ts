import { describe, it, expect } from "vitest";
import {
  reducer,
  initialState,
  computeEffectiveSnapshot,
  buildChangeSummary,
  buildBatchPayload,
  type GroupEditorV2Action,
} from "@/hooks/use-group-editor-v2";
import type { ProductGroupsV2Snapshot } from "@/types";

// --- Helpers ---

function dispatch(actions: GroupEditorV2Action[]) {
  return actions.reduce(reducer, initialState);
}

function makeSnapshot(
  overrides: Partial<ProductGroupsV2Snapshot> = {},
): ProductGroupsV2Snapshot {
  return {
    product_id: "product-1",
    groups: [],
    unassigned: [],
    ...overrides,
  };
}

const ALICE = {
  id: "gedu-alice",
  display_name: "Alice",
  email: "alice@test.com",
};
const BOB = {
  id: "gedu-bob",
  display_name: "Bob",
  email: "bob@test.com",
};

const ZOE = {
  id: "p-zoe",
  gamer_id: "g-zoe",
  gamer_display_name: "Zoe",
  gamer_date_of_birth: "2015-01-01",
  gamer_gender: "girl" as const,
  status: "active" as const,
  signed_up_at: "2026-01-01T00:00:00Z",
};
const YANNI = {
  id: "p-yanni",
  gamer_id: "g-yanni",
  gamer_display_name: "Yanni",
  gamer_date_of_birth: "2014-06-01",
  gamer_gender: "boy" as const,
  status: "active" as const,
  signed_up_at: "2026-01-02T00:00:00Z",
};

// ===========================================================================
// Reducer
// ===========================================================================

describe("useGroupEditorV2 reducer", () => {
  describe("ADD_GROUP", () => {
    it("adds a new group with a temp id and the given name", () => {
      const state = dispatch([{ type: "ADD_GROUP", name: "Group A" }]);
      expect(state.addedGroups).toHaveLength(1);
      expect(state.addedGroups[0].name).toBe("Group A");
      expect(state.addedGroups[0].gedus).toEqual([]);
      expect(state.addedGroups[0].tempId).toMatch(/^temp-/);
    });

    it("optionally seeds initial Gedus with their display details", () => {
      const state = dispatch([
        {
          type: "ADD_GROUP",
          name: "Group A",
          gedus: [
            { id: "g1", displayName: "Alice", email: "alice@test.com" },
            { id: "g2", displayName: "Bob", email: null },
          ],
        },
      ]);
      expect(state.addedGroups[0].gedus).toEqual([
        { id: "g1", displayName: "Alice", email: "alice@test.com" },
        { id: "g2", displayName: "Bob", email: null },
      ]);
    });

    it("generates unique temp ids across multiple adds", () => {
      const state = dispatch([
        { type: "ADD_GROUP", name: "A" },
        { type: "ADD_GROUP", name: "B" },
      ]);
      expect(state.addedGroups[0].tempId).not.toBe(state.addedGroups[1].tempId);
    });
  });

  describe("RENAME_GROUP", () => {
    it("renames an added group in place (no entry in renamedGroups)", () => {
      const afterAdd = dispatch([{ type: "ADD_GROUP", name: "Group A" }]);
      const tempId = afterAdd.addedGroups[0].tempId;

      const state = reducer(afterAdd, {
        type: "RENAME_GROUP",
        groupId: tempId,
        name: "Group A renamed",
      });

      expect(state.addedGroups[0].name).toBe("Group A renamed");
      expect(state.renamedGroups).toHaveLength(0);
    });

    it("upserts a rename for an existing server group", () => {
      const a = reducer(initialState, {
        type: "RENAME_GROUP",
        groupId: "server-1",
        name: "First",
      });
      expect(a.renamedGroups).toEqual([{ groupId: "server-1", name: "First" }]);

      const b = reducer(a, {
        type: "RENAME_GROUP",
        groupId: "server-1",
        name: "Second",
      });
      expect(b.renamedGroups).toEqual([
        { groupId: "server-1", name: "Second" },
      ]);
    });
  });

  describe("DELETE_GROUP", () => {
    it("dropping a newly-added group also strips related staged operations", () => {
      const afterAdd = dispatch([{ type: "ADD_GROUP", name: "Group A" }]);
      const tempId = afterAdd.addedGroups[0].tempId;

      const withMoves = reducer(afterAdd, {
        type: "MOVE_PARTICIPATION",
        participationId: "p1",
        toGroupId: tempId,
        serverGroupId: null,
      });
      expect(withMoves.participationMoves).toHaveLength(1);

      const state = reducer(withMoves, {
        type: "DELETE_GROUP",
        groupId: tempId,
      });
      expect(state.addedGroups).toHaveLength(0);
      expect(state.participationMoves).toHaveLength(0);
    });

    it("marks an existing group for deletion and strips related rename + moves into it", () => {
      const renamed = reducer(initialState, {
        type: "RENAME_GROUP",
        groupId: "server-1",
        name: "Rename me",
      });
      const moveInto = reducer(renamed, {
        type: "MOVE_PARTICIPATION",
        participationId: "p1",
        toGroupId: "server-1",
        serverGroupId: null,
      });

      const state = reducer(moveInto, {
        type: "DELETE_GROUP",
        groupId: "server-1",
      });
      expect(state.deletedGroupIds).toEqual(["server-1"]);
      expect(state.renamedGroups).toEqual([]);
      expect(state.participationMoves).toEqual([]);
    });
  });

  describe("ADD_GEDU and REMOVE_GEDU", () => {
    it("adding to a newly-added group mutates that group's Gedu list and carries display details", () => {
      const afterAdd = dispatch([{ type: "ADD_GROUP", name: "G" }]);
      const tempId = afterAdd.addedGroups[0].tempId;

      const state = reducer(afterAdd, {
        type: "ADD_GEDU",
        groupId: tempId,
        geduId: "gedu-1",
        displayName: "Alice",
        email: "alice@test.com",
      });
      expect(state.addedGroups[0].gedus).toEqual([
        { id: "gedu-1", displayName: "Alice", email: "alice@test.com" },
      ]);
      expect(state.geduAssignmentsAdded).toEqual([]);
    });

    it("adding to an existing group records a pending assignment with display details", () => {
      const state = reducer(initialState, {
        type: "ADD_GEDU",
        groupId: "server-1",
        geduId: "gedu-1",
        displayName: "Alice",
        email: "alice@test.com",
      });
      expect(state.geduAssignmentsAdded).toEqual([
        {
          groupId: "server-1",
          geduId: "gedu-1",
          displayName: "Alice",
          email: "alice@test.com",
        },
      ]);
    });

    it("ADD_GEDU then REMOVE_GEDU on the same pair cancels out (no net staged change)", () => {
      const a = reducer(initialState, {
        type: "ADD_GEDU",
        groupId: "server-1",
        geduId: "gedu-1",
        displayName: "Alice",
        email: null,
      });
      const b = reducer(a, {
        type: "REMOVE_GEDU",
        groupId: "server-1",
        geduId: "gedu-1",
      });
      expect(b.geduAssignmentsAdded).toEqual([]);
      expect(b.geduAssignmentsRemoved).toEqual([]);
    });

    it("REMOVE_GEDU then ADD_GEDU also cancels out", () => {
      const a = reducer(initialState, {
        type: "REMOVE_GEDU",
        groupId: "server-1",
        geduId: "gedu-1",
      });
      const b = reducer(a, {
        type: "ADD_GEDU",
        groupId: "server-1",
        geduId: "gedu-1",
        displayName: "Alice",
        email: null,
      });
      expect(b.geduAssignmentsAdded).toEqual([]);
      expect(b.geduAssignmentsRemoved).toEqual([]);
    });

    it("ADD_GEDU is idempotent for the same (group, gedu) pair", () => {
      const a = reducer(initialState, {
        type: "ADD_GEDU",
        groupId: "server-1",
        geduId: "gedu-1",
        displayName: "Alice",
        email: null,
      });
      const b = reducer(a, {
        type: "ADD_GEDU",
        groupId: "server-1",
        geduId: "gedu-1",
        displayName: "Alice",
        email: null,
      });
      expect(b.geduAssignmentsAdded).toEqual([
        {
          groupId: "server-1",
          geduId: "gedu-1",
          displayName: "Alice",
          email: null,
        },
      ]);
    });
  });

  describe("MOVE_PARTICIPATION", () => {
    it("records a new move", () => {
      const state = reducer(initialState, {
        type: "MOVE_PARTICIPATION",
        participationId: "p1",
        toGroupId: "server-1",
        serverGroupId: null,
      });
      expect(state.participationMoves).toEqual([
        { participationId: "p1", toGroupId: "server-1" },
      ]);
    });

    it("upserts: re-moving overwrites the destination", () => {
      const a = reducer(initialState, {
        type: "MOVE_PARTICIPATION",
        participationId: "p1",
        toGroupId: "server-1",
        serverGroupId: null,
      });
      const b = reducer(a, {
        type: "MOVE_PARTICIPATION",
        participationId: "p1",
        toGroupId: "server-2",
        serverGroupId: null,
      });
      expect(b.participationMoves).toEqual([
        { participationId: "p1", toGroupId: "server-2" },
      ]);
    });

    it("toGroupId=null is the unassigned-inbox sentinel", () => {
      const state = reducer(initialState, {
        type: "MOVE_PARTICIPATION",
        participationId: "p1",
        toGroupId: null,
        serverGroupId: "server-1",
      });
      expect(state.participationMoves[0].toGroupId).toBeNull();
    });

    // Regression coverage for the phantom-change bug: dragging onto the same
    // column the participation already lives in must not produce a staged
    // move. Otherwise the commit bar lights up with a "1 unsaved change"
    // even though nothing actually changed.
    it("ignores a drop onto the same column the server already has it in", () => {
      const state = reducer(initialState, {
        type: "MOVE_PARTICIPATION",
        participationId: "p1",
        toGroupId: "server-A",
        serverGroupId: "server-A",
      });
      expect(state.participationMoves).toEqual([]);
      expect(state).toEqual(initialState);
    });

    it("ignores a drop back into Unassigned when the server has it Unassigned", () => {
      const state = reducer(initialState, {
        type: "MOVE_PARTICIPATION",
        participationId: "p1",
        toGroupId: null,
        serverGroupId: null,
      });
      expect(state).toEqual(initialState);
    });

    it("cancels a previously staged move when dragged back to the original column (round-trip)", () => {
      const a = reducer(initialState, {
        type: "MOVE_PARTICIPATION",
        participationId: "p1",
        toGroupId: "server-B",
        serverGroupId: "server-A",
      });
      expect(a.participationMoves).toHaveLength(1);

      const b = reducer(a, {
        type: "MOVE_PARTICIPATION",
        participationId: "p1",
        toGroupId: "server-A",
        serverGroupId: "server-A",
      });
      expect(b.participationMoves).toEqual([]);
    });

    it("round-trip via Unassigned (A → Unassigned → A) ends with no staged moves", () => {
      const a = reducer(initialState, {
        type: "MOVE_PARTICIPATION",
        participationId: "p1",
        toGroupId: null,
        serverGroupId: "server-A",
      });
      const b = reducer(a, {
        type: "MOVE_PARTICIPATION",
        participationId: "p1",
        toGroupId: "server-A",
        serverGroupId: "server-A",
      });
      expect(b.participationMoves).toEqual([]);
    });
  });

  describe("RESET", () => {
    it("clears all staged buckets", () => {
      const dirty = dispatch([
        { type: "ADD_GROUP", name: "G" },
        { type: "RENAME_GROUP", groupId: "server-1", name: "Renamed" },
        { type: "DELETE_GROUP", groupId: "server-2" },
        {
          type: "ADD_GEDU",
          groupId: "server-3",
          geduId: "gedu-1",
          displayName: "Alice",
          email: null,
        },
        {
          type: "MOVE_PARTICIPATION",
          participationId: "p1",
          toGroupId: "server-3",
          serverGroupId: null,
        },
      ]);
      expect(dirty).not.toEqual(initialState);

      const state = reducer(dirty, { type: "RESET" });
      expect(state).toEqual(initialState);
    });
  });
});

// ===========================================================================
// computeEffectiveSnapshot
// ===========================================================================

describe("computeEffectiveSnapshot", () => {
  it("returns the server snapshot unchanged when state is empty", () => {
    const server = makeSnapshot({
      groups: [
        {
          id: "server-1",
          name: "A",
          display_order: 0,
          created_at: "2026-01-01T00:00:00Z",
          gedus: [ALICE],
          participations: [ZOE],
        },
      ],
      unassigned: [YANNI],
    });

    const snap = computeEffectiveSnapshot(server, initialState);
    expect(snap.groups).toHaveLength(1);
    expect(snap.groups[0].name).toBe("A");
    expect(snap.groups[0].gedus.map((g) => g.id)).toEqual([ALICE.id]);
    expect(snap.groups[0].participations.map((p) => p.id)).toEqual([ZOE.id]);
    expect(snap.unassigned.map((p) => p.id)).toEqual([YANNI.id]);
  });

  it("applies a rename for an existing server group", () => {
    const server = makeSnapshot({
      groups: [
        {
          id: "server-1",
          name: "Old",
          display_order: 0,
          created_at: "2026-01-01T00:00:00Z",
          gedus: [],
          participations: [],
        },
      ],
    });
    const state = reducer(initialState, {
      type: "RENAME_GROUP",
      groupId: "server-1",
      name: "New",
    });
    const snap = computeEffectiveSnapshot(server, state);
    expect(snap.groups[0].name).toBe("New");
  });

  it("treats a deleted group's participations as unassigned", () => {
    const server = makeSnapshot({
      groups: [
        {
          id: "server-1",
          name: "A",
          display_order: 0,
          created_at: "2026-01-01T00:00:00Z",
          gedus: [],
          participations: [ZOE],
        },
      ],
    });
    const state = reducer(initialState, {
      type: "DELETE_GROUP",
      groupId: "server-1",
    });
    const snap = computeEffectiveSnapshot(server, state);
    expect(snap.groups[0].isDeleted).toBe(true);
    expect(snap.groups[0].participations).toHaveLength(0);
    expect(snap.unassigned.map((p) => p.id)).toEqual([ZOE.id]);
  });

  it("places a moved participation in the target group with isMoved=true", () => {
    const server = makeSnapshot({
      groups: [
        {
          id: "server-A",
          name: "A",
          display_order: 0,
          created_at: "2026-01-01T00:00:00Z",
          gedus: [],
          participations: [ZOE],
        },
        {
          id: "server-B",
          name: "B",
          display_order: 1,
          created_at: "2026-01-01T00:00:00Z",
          gedus: [],
          participations: [],
        },
      ],
    });
    const state = reducer(initialState, {
      type: "MOVE_PARTICIPATION",
      participationId: ZOE.id,
      toGroupId: "server-B",
      serverGroupId: "server-A",
    });
    const snap = computeEffectiveSnapshot(server, state);
    expect(snap.groups[0].participations).toHaveLength(0);
    expect(snap.groups[1].participations).toHaveLength(1);
    expect(snap.groups[1].participations[0].isMoved).toBe(true);
  });

  it("placing a participation in a brand-new group via tempId works", () => {
    const server = makeSnapshot({ unassigned: [YANNI] });
    const stateA = reducer(initialState, { type: "ADD_GROUP", name: "Brand New" });
    const tempId = stateA.addedGroups[0].tempId;
    const state = reducer(stateA, {
      type: "MOVE_PARTICIPATION",
      participationId: YANNI.id,
      toGroupId: tempId,
      serverGroupId: null,
    });
    const snap = computeEffectiveSnapshot(server, state);
    expect(snap.unassigned).toHaveLength(0);
    expect(snap.groups).toHaveLength(1);
    expect(snap.groups[0].id).toBe(tempId);
    expect(snap.groups[0].isNew).toBe(true);
    expect(snap.groups[0].participations.map((p) => p.id)).toEqual([YANNI.id]);
  });

  it("marks added/removed Gedus with isPending / isPendingRemove", () => {
    const server = makeSnapshot({
      groups: [
        {
          id: "server-1",
          name: "A",
          display_order: 0,
          created_at: "2026-01-01T00:00:00Z",
          gedus: [ALICE],
          participations: [],
        },
      ],
    });
    const state = dispatch([
      {
        type: "ADD_GEDU",
        groupId: "server-1",
        geduId: BOB.id,
        displayName: BOB.display_name,
        email: BOB.email,
      },
      { type: "REMOVE_GEDU", groupId: "server-1", geduId: ALICE.id },
    ]);
    const snap = computeEffectiveSnapshot(server, state);

    const alice = snap.groups[0].gedus.find((g) => g.id === ALICE.id);
    expect(alice?.isPendingRemove).toBe(true);
    expect(alice?.isPending).toBe(false);

    // Bob isn't on the server snapshot for this product, but the action
    // carries his details — the pending pill renders his real name, not
    // "Unknown".
    const bob = snap.groups[0].gedus.find((g) => g.id === BOB.id);
    expect(bob?.isPending).toBe(true);
    expect(bob?.isPendingRemove).toBe(false);
    expect(bob?.display_name).toBe("Bob");
    expect(bob?.email).toBe(BOB.email);
  });

  it("uses the action-supplied name for a Gedu added inline at group creation", () => {
    const server = makeSnapshot();
    const state = reducer(initialState, {
      type: "ADD_GROUP",
      name: "Brand New",
      gedus: [{ id: "gedu-x", displayName: "Charlie", email: null }],
    });
    const snap = computeEffectiveSnapshot(server, state);
    expect(snap.groups[0].gedus).toHaveLength(1);
    expect(snap.groups[0].gedus[0].display_name).toBe("Charlie");
  });
});

// ===========================================================================
// buildChangeSummary
// ===========================================================================

describe("buildChangeSummary", () => {
  it("hasChanges=false on an empty state", () => {
    const summary = buildChangeSummary(initialState, makeSnapshot());
    expect(summary.hasChanges).toBe(false);
    expect(summary.lines).toEqual([]);
  });

  it("emits one line per staged change in canonical order", () => {
    const server = makeSnapshot({
      groups: [
        {
          id: "server-1",
          name: "Old",
          display_order: 0,
          created_at: "2026-01-01T00:00:00Z",
          gedus: [ALICE],
          participations: [ZOE],
        },
      ],
      unassigned: [YANNI],
    });
    const state = dispatch([
      { type: "ADD_GROUP", name: "Brand New" },
      { type: "DELETE_GROUP", groupId: "ghost-id" }, // unknown, line still emits with placeholder
      { type: "RENAME_GROUP", groupId: "server-1", name: "Renamed" },
      {
        type: "ADD_GEDU",
        groupId: "server-1",
        geduId: BOB.id,
        displayName: BOB.display_name,
        email: BOB.email,
      },
      {
        type: "MOVE_PARTICIPATION",
        participationId: ZOE.id,
        toGroupId: null,
        serverGroupId: "server-1",
      },
    ]);
    const summary = buildChangeSummary(state, server);
    expect(summary.hasChanges).toBe(true);
    // 5 actions → 5 summary lines.
    expect(summary.lines).toHaveLength(5);

    const flat = summary.lines.map((line) =>
      line.map((seg) => seg.value).join(""),
    );
    expect(flat[0]).toContain("Add group ");
    expect(flat[0]).toContain("Brand New");
    expect(flat[2]).toContain("Old");
    expect(flat[2]).toContain("Renamed");
    expect(flat[4]).toContain("Zoe");
    expect(flat[4]).toContain("unassigned");
  });

  it("skips a rename whose new name equals the current one", () => {
    const server = makeSnapshot({
      groups: [
        {
          id: "server-1",
          name: "A",
          display_order: 0,
          created_at: "2026-01-01T00:00:00Z",
          gedus: [],
          participations: [],
        },
      ],
    });
    const state = reducer(initialState, {
      type: "RENAME_GROUP",
      groupId: "server-1",
      name: "A",
    });
    const summary = buildChangeSummary(state, server);
    expect(summary.lines).toEqual([]);
  });
});

// ===========================================================================
// buildBatchPayload
// ===========================================================================

describe("buildBatchPayload", () => {
  it("returns the wire shape verbatim", () => {
    const state = dispatch([
      {
        type: "ADD_GROUP",
        name: "A",
        gedus: [{ id: "g1", displayName: "Alice", email: null }],
      },
      { type: "RENAME_GROUP", groupId: "server-1", name: "Renamed" },
      { type: "DELETE_GROUP", groupId: "server-2" },
      {
        type: "ADD_GEDU",
        groupId: "server-1",
        geduId: "g3",
        displayName: "Charlie",
        email: "c@test.com",
      },
      { type: "REMOVE_GEDU", groupId: "server-1", geduId: "g4" },
      {
        type: "MOVE_PARTICIPATION",
        participationId: "p1",
        toGroupId: null,
        serverGroupId: "server-1",
      },
    ]);
    const payload = buildBatchPayload(state);

    expect(payload.addedGroups).toHaveLength(1);
    expect(payload.addedGroups[0].name).toBe("A");
    // Wire shape stays as a string[] of ids — the editor's display details
    // are stripped here so they aren't sent to the server.
    expect(payload.addedGroups[0].geduIds).toEqual(["g1"]);
    expect(payload.renamedGroups).toEqual([
      { groupId: "server-1", name: "Renamed" },
    ]);
    expect(payload.deletedGroupIds).toEqual(["server-2"]);
    expect(payload.geduAssignmentsAdded).toEqual([
      { groupId: "server-1", geduId: "g3" },
    ]);
    expect(payload.geduAssignmentsRemoved).toEqual([
      { groupId: "server-1", geduId: "g4" },
    ]);
    expect(payload.participationMoves).toEqual([
      { participationId: "p1", toGroupId: null },
    ]);
  });
});
