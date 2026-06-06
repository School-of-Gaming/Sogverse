import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GroupsService, type GroupChangeSet } from "@/services/groups";
import type { Database } from "@/types/database.types";

// The intent-named methods (createGroup, renameGroup, …) are thin adapters:
// each builds a single-action GroupChangeSet and POSTs it to the apply route.
// These tests pin the wire shape — exactly one field populated, the rest empty —
// so a future reader sees that single-action calls are the contract.

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";
const APPLY_URL = `/api/admin/products/${PRODUCT_ID}/groups/apply`;

const EMPTY: GroupChangeSet = {
  addedGroups: [],
  renamedGroups: [],
  deletedGroupIds: [],
  geduAssignmentsAdded: [],
  geduAssignmentsRemoved: [],
  participationMoves: [],
};

describe("GroupsService intent methods", () => {
  let service: GroupsService;
  let fetchMock: ReturnType<typeof vi.fn>;

  function mockApplyResponse(body: unknown = { tempMap: {} }) {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => body,
    } as Response);
  }

  /** The change set sent to the apply route on the most recent call. */
  function sentChangeSet(): GroupChangeSet {
    const [, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    return JSON.parse(init.body as string) as GroupChangeSet;
  }

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    // The fetch-based methods don't touch the injected client.
    service = new GroupsService({} as unknown as SupabaseClient<Database>);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("createGroup sends only addedGroups and returns the tempMap-resolved id", async () => {
    // The service mints its own tempId; echo it back as the tempMap key so we
    // can verify it resolves the real id the RPC would assign.
    fetchMock.mockImplementation((_url, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as GroupChangeSet;
      const tempId = body.addedGroups[0].tempId;
      return Promise.resolve({
        ok: true,
        json: async () => ({ tempMap: { [tempId]: "real-group-id" } }),
      } as Response);
    });

    const realId = await service.createGroup(PRODUCT_ID, "Group A", ["ge1"]);

    expect(fetchMock).toHaveBeenCalledWith(APPLY_URL, expect.anything());
    expect(realId).toBe("real-group-id");

    const sent = sentChangeSet();
    expect(sent.addedGroups).toHaveLength(1);
    expect(sent.addedGroups[0]).toMatchObject({
      name: "Group A",
      geduIds: ["ge1"],
    });
    expect({ ...sent, addedGroups: [] }).toEqual(EMPTY);
  });

  it("renameGroup sends only renamedGroups", async () => {
    mockApplyResponse();
    await service.renameGroup(PRODUCT_ID, "G1", "New name");
    const sent = sentChangeSet();
    expect(sent.renamedGroups).toEqual([{ groupId: "G1", name: "New name" }]);
    expect({ ...sent, renamedGroups: [] }).toEqual(EMPTY);
  });

  it("deleteGroup sends only deletedGroupIds", async () => {
    mockApplyResponse();
    await service.deleteGroup(PRODUCT_ID, "G1");
    const sent = sentChangeSet();
    expect(sent.deletedGroupIds).toEqual(["G1"]);
    expect({ ...sent, deletedGroupIds: [] }).toEqual(EMPTY);
  });

  it("moveParticipation sends only participationMoves (group and unassign)", async () => {
    mockApplyResponse();
    await service.moveParticipation(PRODUCT_ID, "p1", "G1");
    expect(sentChangeSet().participationMoves).toEqual([
      { participationId: "p1", toGroupId: "G1" },
    ]);

    await service.moveParticipation(PRODUCT_ID, "p2", null);
    const sent = sentChangeSet();
    expect(sent.participationMoves).toEqual([
      { participationId: "p2", toGroupId: null },
    ]);
    expect({ ...sent, participationMoves: [] }).toEqual(EMPTY);
  });

  it("addGedu sends only geduAssignmentsAdded", async () => {
    mockApplyResponse();
    await service.addGedu(PRODUCT_ID, "G1", "ge1");
    const sent = sentChangeSet();
    expect(sent.geduAssignmentsAdded).toEqual([{ groupId: "G1", geduId: "ge1" }]);
    expect({ ...sent, geduAssignmentsAdded: [] }).toEqual(EMPTY);
  });

  it("removeGedu sends only geduAssignmentsRemoved", async () => {
    mockApplyResponse();
    await service.removeGedu(PRODUCT_ID, "G1", "ge1");
    const sent = sentChangeSet();
    expect(sent.geduAssignmentsRemoved).toEqual([
      { groupId: "G1", geduId: "ge1" },
    ]);
    expect({ ...sent, geduAssignmentsRemoved: [] }).toEqual(EMPTY);
  });

  it("surfaces the route's error message when the request fails", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "A Gedu can only run one group" }),
    } as Response);

    await expect(service.addGedu(PRODUCT_ID, "G1", "ge1")).rejects.toThrow(
      "A Gedu can only run one group",
    );
  });
});
