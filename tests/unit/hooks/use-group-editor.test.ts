import { describe, it, expect } from "vitest";
import {
  reducer,
  initialState,
  computeEffectiveGroups,
  buildChangeSummary,
  buildNotifyPayload,
  type GroupEditorAction,
} from "@/hooks/use-group-editor";
import type { ProductGroup } from "@/services/groups";

// --- Helpers ---

function dispatch(actions: GroupEditorAction[]) {
  return actions.reduce(reducer, initialState);
}

function makeServerGroup(overrides: Partial<ProductGroup> = {}): ProductGroup {
  return {
    groupId: "group-1",
    productId: "product-1",
    geduId: "gedu-1",
    displayOrder: 0,
    geduDisplayName: "Alice",
    geduEmail: "alice@test.com",
    gamers: [],
    ...overrides,
  };
}

// --- Reducer ---

describe("reducer", () => {
  describe("ADD_GROUP", () => {
    it("adds a new group with a temp id", () => {
      const state = dispatch([
        { type: "ADD_GROUP", geduId: "gedu-1", geduDisplayName: "Alice" },
      ]);

      expect(state.addedGroups).toHaveLength(1);
      expect(state.addedGroups[0].geduId).toBe("gedu-1");
      expect(state.addedGroups[0].geduDisplayName).toBe("Alice");
      expect(state.addedGroups[0].tempId).toMatch(/^temp-/);
    });

    it("generates unique temp ids", () => {
      const state = dispatch([
        { type: "ADD_GROUP", geduId: "gedu-1", geduDisplayName: "Alice" },
        { type: "ADD_GROUP", geduId: "gedu-2", geduDisplayName: "Bob" },
      ]);

      expect(state.addedGroups).toHaveLength(2);
      expect(state.addedGroups[0].tempId).not.toBe(state.addedGroups[1].tempId);
    });
  });

  describe("UPDATE_GROUP_GEDU", () => {
    it("updates an added group in-place", () => {
      const afterAdd = dispatch([
        { type: "ADD_GROUP", geduId: "gedu-1", geduDisplayName: "Alice" },
      ]);
      const tempId = afterAdd.addedGroups[0].tempId;

      const state = reducer(afterAdd, {
        type: "UPDATE_GROUP_GEDU",
        groupId: tempId,
        geduId: "gedu-2",
        geduDisplayName: "Bob",
      });

      expect(state.addedGroups).toHaveLength(1);
      expect(state.addedGroups[0].geduId).toBe("gedu-2");
      expect(state.addedGroups[0].geduDisplayName).toBe("Bob");
      expect(state.updatedGroups).toHaveLength(0);
    });

    it("creates an update entry for an existing server group", () => {
      const state = dispatch([
        { type: "UPDATE_GROUP_GEDU", groupId: "server-group-1", geduId: "gedu-2", geduDisplayName: "Bob" },
      ]);

      expect(state.updatedGroups).toHaveLength(1);
      expect(state.updatedGroups[0]).toEqual({
        groupId: "server-group-1",
        geduId: "gedu-2",
        geduDisplayName: "Bob",
      });
    });

    it("overwrites a previous update for the same server group", () => {
      const state = dispatch([
        { type: "UPDATE_GROUP_GEDU", groupId: "server-group-1", geduId: "gedu-2", geduDisplayName: "Bob" },
        { type: "UPDATE_GROUP_GEDU", groupId: "server-group-1", geduId: "gedu-3", geduDisplayName: "Carol" },
      ]);

      expect(state.updatedGroups).toHaveLength(1);
      expect(state.updatedGroups[0].geduId).toBe("gedu-3");
      expect(state.updatedGroups[0].geduDisplayName).toBe("Carol");
    });
  });

  describe("DELETE_GROUP", () => {
    it("removes an added group entirely", () => {
      const afterAdd = dispatch([
        { type: "ADD_GROUP", geduId: "gedu-1", geduDisplayName: "Alice" },
      ]);
      const tempId = afterAdd.addedGroups[0].tempId;

      const state = reducer(afterAdd, { type: "DELETE_GROUP", groupId: tempId });

      expect(state.addedGroups).toHaveLength(0);
      expect(state.deletedGroupIds).toHaveLength(0);
    });

    it("marks a server group for deletion", () => {
      const state = dispatch([
        { type: "DELETE_GROUP", groupId: "server-group-1" },
      ]);

      expect(state.deletedGroupIds).toEqual(["server-group-1"]);
    });

    it("removes related updates when deleting a server group", () => {
      const state = dispatch([
        { type: "UPDATE_GROUP_GEDU", groupId: "server-group-1", geduId: "gedu-2", geduDisplayName: "Bob" },
        { type: "DELETE_GROUP", groupId: "server-group-1" },
      ]);

      expect(state.updatedGroups).toHaveLength(0);
      expect(state.deletedGroupIds).toEqual(["server-group-1"]);
    });

    it("removes moves INTO a deleted group but keeps moves FROM it", () => {
      const state = dispatch([
        { type: "MOVE_GAMER", gamerId: "gamer-1", fromGroupId: "group-a", toGroupId: "group-b" },
        { type: "MOVE_GAMER", gamerId: "gamer-2", fromGroupId: "group-c", toGroupId: "group-a" },
        { type: "DELETE_GROUP", groupId: "group-a" },
      ]);

      // Move FROM group-a should survive (gamer-1 still goes to group-b)
      expect(state.enrollmentMoves).toHaveLength(1);
      expect(state.enrollmentMoves[0].gamerId).toBe("gamer-1");
    });

    it("removes moves involving a deleted added group", () => {
      const afterAdd = dispatch([
        { type: "ADD_GROUP", geduId: "gedu-1", geduDisplayName: "Alice" },
      ]);
      const tempId = afterAdd.addedGroups[0].tempId;

      const withMoves = reducer(afterAdd, {
        type: "MOVE_GAMER",
        gamerId: "gamer-1",
        fromGroupId: "group-a",
        toGroupId: tempId,
      });

      const state = reducer(withMoves, { type: "DELETE_GROUP", groupId: tempId });

      expect(state.enrollmentMoves).toHaveLength(0);
      expect(state.addedGroups).toHaveLength(0);
    });
  });

  describe("MOVE_GAMER", () => {
    it("adds a new enrollment move", () => {
      const state = dispatch([
        { type: "MOVE_GAMER", gamerId: "gamer-1", fromGroupId: "group-a", toGroupId: "group-b" },
      ]);

      expect(state.enrollmentMoves).toHaveLength(1);
      expect(state.enrollmentMoves[0]).toEqual({
        gamerId: "gamer-1",
        fromGroupId: "group-a",
        toGroupId: "group-b",
      });
    });

    it("ignores move to the same group", () => {
      const state = dispatch([
        { type: "MOVE_GAMER", gamerId: "gamer-1", fromGroupId: "group-a", toGroupId: "group-a" },
      ]);

      expect(state.enrollmentMoves).toHaveLength(0);
    });

    it("cancels a move when moved back to original group", () => {
      const state = dispatch([
        { type: "MOVE_GAMER", gamerId: "gamer-1", fromGroupId: "group-a", toGroupId: "group-b" },
        { type: "MOVE_GAMER", gamerId: "gamer-1", fromGroupId: "group-b", toGroupId: "group-a" },
      ]);

      expect(state.enrollmentMoves).toHaveLength(0);
    });

    it("updates destination when moved to a third group", () => {
      const state = dispatch([
        { type: "MOVE_GAMER", gamerId: "gamer-1", fromGroupId: "group-a", toGroupId: "group-b" },
        { type: "MOVE_GAMER", gamerId: "gamer-1", fromGroupId: "group-b", toGroupId: "group-c" },
      ]);

      expect(state.enrollmentMoves).toHaveLength(1);
      expect(state.enrollmentMoves[0]).toEqual({
        gamerId: "gamer-1",
        fromGroupId: "group-a",
        toGroupId: "group-c",
      });
    });

    it("tracks moves for different gamers independently", () => {
      const state = dispatch([
        { type: "MOVE_GAMER", gamerId: "gamer-1", fromGroupId: "group-a", toGroupId: "group-b" },
        { type: "MOVE_GAMER", gamerId: "gamer-2", fromGroupId: "group-a", toGroupId: "group-c" },
      ]);

      expect(state.enrollmentMoves).toHaveLength(2);
    });
  });

  describe("RESET", () => {
    it("clears all staged changes", () => {
      const state = dispatch([
        { type: "ADD_GROUP", geduId: "gedu-1", geduDisplayName: "Alice" },
        { type: "UPDATE_GROUP_GEDU", groupId: "server-1", geduId: "gedu-2", geduDisplayName: "Bob" },
        { type: "DELETE_GROUP", groupId: "server-2" },
        { type: "MOVE_GAMER", gamerId: "gamer-1", fromGroupId: "group-a", toGroupId: "group-b" },
        { type: "RESET" },
      ]);

      expect(state).toEqual(initialState);
    });
  });
});

// --- computeEffectiveGroups ---

describe("computeEffectiveGroups", () => {
  it("returns server groups unchanged when no edits", () => {
    const server = [
      makeServerGroup({ groupId: "g1", displayOrder: 0, gamers: [] }),
    ];

    const result = computeEffectiveGroups(server, initialState);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("g1");
    expect(result[0].isNew).toBe(false);
    expect(result[0].isDeleted).toBe(false);
  });

  it("applies gedu update to a server group", () => {
    const server = [
      makeServerGroup({ groupId: "g1", geduId: "gedu-1", geduDisplayName: "Alice" }),
    ];
    const state = dispatch([
      { type: "UPDATE_GROUP_GEDU", groupId: "g1", geduId: "gedu-2", geduDisplayName: "Bob" },
    ]);

    const result = computeEffectiveGroups(server, state);

    expect(result[0].geduId).toBe("gedu-2");
    expect(result[0].geduDisplayName).toBe("Bob");
  });

  it("marks deleted groups and empties their gamers", () => {
    const server = [
      makeServerGroup({
        groupId: "g1",
        gamers: [
          { gamerId: "gamer-1", displayName: "Kid", enrollmentId: "e1", dateOfBirth: "2015-01-01", gender: "boy" },
        ],
      }),
    ];
    const state = dispatch([{ type: "DELETE_GROUP", groupId: "g1" }]);

    const result = computeEffectiveGroups(server, state);

    expect(result[0].isDeleted).toBe(true);
    expect(result[0].gamers).toHaveLength(0);
  });

  it("removes moved-out gamers and adds moved-in gamers", () => {
    const server = [
      makeServerGroup({
        groupId: "g1",
        gamers: [
          { gamerId: "gamer-1", displayName: "Kid A", enrollmentId: "e1", dateOfBirth: "2015-01-01", gender: "boy" },
        ],
      }),
      makeServerGroup({
        groupId: "g2",
        displayOrder: 1,
        geduId: "gedu-2",
        geduDisplayName: "Bob",
        gamers: [
          { gamerId: "gamer-2", displayName: "Kid B", enrollmentId: "e2", dateOfBirth: "2015-01-01", gender: "boy" },
        ],
      }),
    ];
    const state = dispatch([
      { type: "MOVE_GAMER", gamerId: "gamer-1", fromGroupId: "g1", toGroupId: "g2" },
    ]);

    const result = computeEffectiveGroups(server, state);

    // g1 should lose gamer-1
    const g1 = result.find((g) => g.id === "g1")!;
    expect(g1.gamers).toHaveLength(0);

    // g2 should gain gamer-1
    const g2 = result.find((g) => g.id === "g2")!;
    expect(g2.gamers).toHaveLength(2);
    const movedGamer = g2.gamers.find((g) => g.gamerId === "gamer-1")!;
    expect(movedGamer.isMoved).toBe(true);
    expect(movedGamer.displayName).toBe("Kid A");
  });

  it("includes added groups with moved-in gamers", () => {
    const server = [
      makeServerGroup({
        groupId: "g1",
        gamers: [
          { gamerId: "gamer-1", displayName: "Kid A", enrollmentId: "e1", dateOfBirth: "2015-01-01", gender: "boy" },
        ],
      }),
    ];

    const afterAdd = dispatch([
      { type: "ADD_GROUP", geduId: "gedu-2", geduDisplayName: "Bob" },
    ]);
    const tempId = afterAdd.addedGroups[0].tempId;
    const state = reducer(afterAdd, {
      type: "MOVE_GAMER",
      gamerId: "gamer-1",
      fromGroupId: "g1",
      toGroupId: tempId,
    });

    const result = computeEffectiveGroups(server, state);

    const newGroup = result.find((g) => g.id === tempId)!;
    expect(newGroup).toBeDefined();
    expect(newGroup.isNew).toBe(true);
    expect(newGroup.gamers).toHaveLength(1);
    expect(newGroup.gamers[0].gamerId).toBe("gamer-1");
    expect(newGroup.gamers[0].isMoved).toBe(true);
  });

  it("assigns correct displayOrder to added groups", () => {
    const server = [
      makeServerGroup({ groupId: "g1", displayOrder: 0 }),
      makeServerGroup({ groupId: "g2", displayOrder: 1, geduId: "gedu-2", geduDisplayName: "Bob" }),
    ];
    const state = dispatch([
      { type: "ADD_GROUP", geduId: "gedu-3", geduDisplayName: "Carol" },
    ]);

    const result = computeEffectiveGroups(server, state);

    const newGroup = result.find((g) => g.isNew)!;
    expect(newGroup.displayOrder).toBe(2);
  });
});

// --- buildChangeSummary ---

describe("buildChangeSummary", () => {
  it("returns no changes for initial state", () => {
    const summary = buildChangeSummary(initialState, []);

    expect(summary.hasChanges).toBe(false);
    expect(summary.lines).toHaveLength(0);
  });

  it("describes added groups", () => {
    const state = dispatch([
      { type: "ADD_GROUP", geduId: "gedu-1", geduDisplayName: "Alice" },
    ]);

    const summary = buildChangeSummary(state, []);

    expect(summary.hasChanges).toBe(true);
    expect(summary.lines).toHaveLength(1);
    expect(summary.lines[0]).toContainEqual({ type: "text", value: "Add group with " });
    expect(summary.lines[0]).toContainEqual({ type: "gedu", value: "Alice" });
  });

  it("describes gedu reassignments", () => {
    const server = [makeServerGroup({ groupId: "g1", geduDisplayName: "Alice" })];
    const state = dispatch([
      { type: "UPDATE_GROUP_GEDU", groupId: "g1", geduId: "gedu-2", geduDisplayName: "Bob" },
    ]);

    const summary = buildChangeSummary(state, server);

    expect(summary.lines).toHaveLength(1);
    expect(summary.lines[0]).toContainEqual({ type: "gedu", value: "Alice" });
    expect(summary.lines[0]).toContainEqual({ type: "gedu", value: "Bob" });
  });

  it("describes deleted groups", () => {
    const server = [makeServerGroup({ groupId: "g1", geduDisplayName: "Alice" })];
    const state = dispatch([{ type: "DELETE_GROUP", groupId: "g1" }]);

    const summary = buildChangeSummary(state, server);

    // 2 lines: the deletion + the auto-hide warning (last group removed)
    const deleteLine = summary.lines.find((line) =>
      line.some((seg) => seg.type === "text" && seg.value === "Delete "),
    );
    expect(deleteLine).toBeDefined();
    expect(deleteLine).toContainEqual({ type: "gedu", value: "Alice" });
  });

  it("describes gamer moves with names", () => {
    const server = [
      makeServerGroup({
        groupId: "g1",
        geduDisplayName: "Alice",
        gamers: [
          { gamerId: "gamer-1", displayName: "Kid A", enrollmentId: "e1", dateOfBirth: "2015-01-01", gender: "boy" },
        ],
      }),
      makeServerGroup({
        groupId: "g2",
        displayOrder: 1,
        geduId: "gedu-2",
        geduDisplayName: "Bob",
        gamers: [],
      }),
    ];
    const state = dispatch([
      { type: "MOVE_GAMER", gamerId: "gamer-1", fromGroupId: "g1", toGroupId: "g2" },
    ]);

    const summary = buildChangeSummary(state, server);

    expect(summary.lines).toHaveLength(1);
    expect(summary.lines[0]).toContainEqual({ type: "gamer", value: "Kid A" });
    expect(summary.lines[0]).toContainEqual({ type: "gedu", value: "Alice" });
    expect(summary.lines[0]).toContainEqual({ type: "gedu", value: "Bob" });
  });

  it("uses new gedu name in move when target group is also reassigned", () => {
    const server = [
      makeServerGroup({
        groupId: "g1",
        geduDisplayName: "Alice",
        gamers: [
          { gamerId: "gamer-1", displayName: "Kid A", enrollmentId: "e1", dateOfBirth: "2015-01-01", gender: "boy" },
        ],
      }),
      makeServerGroup({
        groupId: "g2",
        displayOrder: 1,
        geduId: "gedu-2",
        geduDisplayName: "Bob",
        gamers: [],
      }),
    ];
    const state = dispatch([
      { type: "UPDATE_GROUP_GEDU", groupId: "g2", geduId: "gedu-3", geduDisplayName: "Charlie" },
      { type: "MOVE_GAMER", gamerId: "gamer-1", fromGroupId: "g1", toGroupId: "g2" },
    ]);

    const summary = buildChangeSummary(state, server);

    const moveLine = summary.lines.find((line) =>
      line.some((seg) => seg.type === "text" && seg.value === "Move "),
    );
    expect(moveLine).toBeDefined();
    // The target group was reassigned from Bob to Charlie, so the move should say Charlie
    expect(moveLine).toContainEqual({ type: "gedu", value: "Alice" });
    expect(moveLine).toContainEqual({ type: "gedu", value: "Charlie" });
    expect(moveLine).not.toContainEqual({ type: "gedu", value: "Bob" });
  });

  it("warns when all groups are deleted", () => {
    const server = [makeServerGroup({ groupId: "g1" })];
    const state = dispatch([{ type: "DELETE_GROUP", groupId: "g1" }]);

    const summary = buildChangeSummary(state, server);

    const warningLine = summary.lines.find((line) =>
      line.some((seg) => seg.type === "warning"),
    );
    expect(warningLine).toBeDefined();
  });

  it("does not warn when a replacement group is added", () => {
    const server = [makeServerGroup({ groupId: "g1" })];
    const state = dispatch([
      { type: "DELETE_GROUP", groupId: "g1" },
      { type: "ADD_GROUP", geduId: "gedu-2", geduDisplayName: "Bob" },
    ]);

    const summary = buildChangeSummary(state, server);

    const warningLine = summary.lines.find((line) =>
      line.some((seg) => seg.type === "warning"),
    );
    expect(warningLine).toBeUndefined();
  });
});

// --- buildNotifyPayload ---

describe("buildNotifyPayload", () => {
  it("builds payload for added groups", () => {
    const state = dispatch([
      { type: "ADD_GROUP", geduId: "gedu-1", geduDisplayName: "Alice" },
    ]);

    const payload = buildNotifyPayload(state, []);

    expect(payload.addedGroups).toEqual([{ geduId: "gedu-1" }]);
    expect(payload.updatedGroups).toHaveLength(0);
    expect(payload.deletedGroups).toHaveLength(0);
    expect(payload.enrollmentMoves).toHaveLength(0);
  });

  it("builds payload for deleted groups with server geduId", () => {
    const server = [makeServerGroup({ groupId: "g1", geduId: "gedu-1" })];
    const state = dispatch([{ type: "DELETE_GROUP", groupId: "g1" }]);

    const payload = buildNotifyPayload(state, server);

    expect(payload.deletedGroups).toEqual([{ geduId: "gedu-1" }]);
  });

  it("builds payload for updated groups with old and new geduId", () => {
    const server = [makeServerGroup({ groupId: "g1", geduId: "gedu-1" })];
    const state = dispatch([
      { type: "UPDATE_GROUP_GEDU", groupId: "g1", geduId: "gedu-2", geduDisplayName: "Bob" },
    ]);

    const payload = buildNotifyPayload(state, server);

    expect(payload.updatedGroups).toEqual([
      { groupId: "g1", oldGeduId: "gedu-1", newGeduId: "gedu-2" },
    ]);
  });

  it("builds enrollment moves with pre-reassignment geduIds", () => {
    const server = [
      makeServerGroup({ groupId: "g1", geduId: "gedu-1", geduDisplayName: "Alice" }),
      makeServerGroup({ groupId: "g2", geduId: "gedu-2", geduDisplayName: "Bob", displayOrder: 1 }),
    ];
    const state = dispatch([
      { type: "MOVE_GAMER", gamerId: "gamer-1", fromGroupId: "g1", toGroupId: "g2" },
    ]);

    const payload = buildNotifyPayload(state, server);

    expect(payload.enrollmentMoves).toEqual([
      { gamerId: "gamer-1", fromGeduId: "gedu-1", toGeduId: "gedu-2" },
    ]);
  });

  it("resolves toGeduId from reassigned group (pre-reassignment is NOT used for to)", () => {
    const server = [
      makeServerGroup({ groupId: "g1", geduId: "gedu-1", geduDisplayName: "Alice" }),
      makeServerGroup({ groupId: "g2", geduId: "gedu-2", geduDisplayName: "Bob", displayOrder: 1 }),
    ];
    const state = dispatch([
      { type: "UPDATE_GROUP_GEDU", groupId: "g2", geduId: "gedu-3", geduDisplayName: "Carol" },
      { type: "MOVE_GAMER", gamerId: "gamer-1", fromGroupId: "g1", toGroupId: "g2" },
    ]);

    const payload = buildNotifyPayload(state, server);

    // toGeduId should be the new gedu (Carol), not the old one (Bob)
    expect(payload.enrollmentMoves[0].toGeduId).toBe("gedu-3");
    expect(payload.enrollmentMoves[0].fromGeduId).toBe("gedu-1");
  });

  it("resolves toGeduId from added group", () => {
    const server = [
      makeServerGroup({ groupId: "g1", geduId: "gedu-1", geduDisplayName: "Alice" }),
    ];
    const afterAdd = dispatch([
      { type: "ADD_GROUP", geduId: "gedu-2", geduDisplayName: "Bob" },
    ]);
    const tempId = afterAdd.addedGroups[0].tempId;
    const state = reducer(afterAdd, {
      type: "MOVE_GAMER",
      gamerId: "gamer-1",
      fromGroupId: "g1",
      toGroupId: tempId,
    });

    const payload = buildNotifyPayload(state, server);

    expect(payload.enrollmentMoves[0].toGeduId).toBe("gedu-2");
    expect(payload.enrollmentMoves[0].fromGeduId).toBe("gedu-1");
  });

  it("builds combined payload with all change types", () => {
    const server = [
      makeServerGroup({ groupId: "g1", geduId: "gedu-1", geduDisplayName: "Alice", gamers: [
        { gamerId: "gamer-1", displayName: "Kid", enrollmentId: "e1", dateOfBirth: "2015-01-01", gender: "boy" },
      ] }),
      makeServerGroup({ groupId: "g2", geduId: "gedu-2", geduDisplayName: "Bob", displayOrder: 1 }),
    ];
    const state = dispatch([
      { type: "ADD_GROUP", geduId: "gedu-3", geduDisplayName: "Carol" },
      { type: "UPDATE_GROUP_GEDU", groupId: "g2", geduId: "gedu-4", geduDisplayName: "Dave" },
      { type: "DELETE_GROUP", groupId: "g1" },
      { type: "MOVE_GAMER", gamerId: "gamer-1", fromGroupId: "g1", toGroupId: "g2" },
    ]);

    const payload = buildNotifyPayload(state, server);

    expect(payload.addedGroups).toHaveLength(1);
    expect(payload.updatedGroups).toHaveLength(1);
    expect(payload.deletedGroups).toHaveLength(1);
    expect(payload.enrollmentMoves).toHaveLength(1);
    expect(payload.enrollmentMoves[0].toGeduId).toBe("gedu-4");
  });
});
