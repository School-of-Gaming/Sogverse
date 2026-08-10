import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { GroupsService, type GroupChangeSet } from "@/services/groups";
import { groupChangeSet } from "@/services/groups/groups.contracts";
import {
  createFetchStubbedClient,
  postgrestJson,
  type FetchMock,
} from "../../mocks/postgrest-fetch";
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
  // The fetch-based methods never touch the injected client, so a real (but
  // never-used) typed client satisfies the constructor without any casting.
  const service = new GroupsService(
    createClient<Database>("http://localhost:54321", "test-anon-key"),
  );
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  function mockApplyResponse(body: unknown = { tempMap: {} }) {
    // A fresh Response per call — a Response body is single-use, and some
    // tests drive the service through more than one request.
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(body)));
  }

  /** The JSON string body of the given fetch RequestInit. */
  function bodyOf(init: RequestInit | undefined): string {
    if (!init || typeof init.body !== "string") {
      throw new Error("expected a string request body");
    }
    return init.body;
  }

  /** The change set sent to the apply route on the most recent call. */
  function sentChangeSet(): GroupChangeSet {
    const call = fetchMock.mock.calls.at(-1);
    if (!call) throw new Error("expected fetch to have been called");
    const [, init] = call;
    return groupChangeSet.parse(JSON.parse(bodyOf(init)));
  }

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("createGroup sends only addedGroups and returns the tempMap-resolved id", async () => {
    // The service mints its own tempId; echo it back as the tempMap key so we
    // can verify it resolves the real id the RPC would assign.
    fetchMock.mockImplementation((_url, init) => {
      const body = groupChangeSet.parse(JSON.parse(bodyOf(init)));
      const tempId = body.addedGroups[0].tempId;
      return Promise.resolve(
        jsonResponse({ tempMap: { [tempId]: "real-group-id" } }),
      );
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
    fetchMock.mockResolvedValue(
      jsonResponse({ error: "A Gedu can only run one group" }, 400),
    );

    await expect(service.addGedu(PRODUCT_ID, "G1", "ge1")).rejects.toThrow(
      "A Gedu can only run one group",
    );
  });
});

describe("GroupsService.getWaitlistPaymentMarkers", () => {
  let fetchMock: FetchMock;
  let service: GroupsService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new GroupsService(createFetchStubbedClient(fetchMock));
  });

  /** The URL the real query builder produced for the last request. */
  function requestedUrl(): URL {
    const call = fetchMock.mock.calls.at(-1);
    if (!call) throw new Error("expected fetch to have been called");
    return new URL(String(call[0]));
  }

  it("asks only for this product's waitlisted rows that carry a marker", async () => {
    fetchMock.mockResolvedValue(postgrestJson([{ id: "p1" }, { id: "p2" }]));

    const ids = await service.getWaitlistPaymentMarkers(PRODUCT_ID);

    expect(ids).toEqual(["p1", "p2"]);

    // Each filter is load-bearing: the wrong status would report active
    // members' markers, and dropping the not-null would report every
    // waitlister as paid — which is precisely the refusal being decided.
    const url = requestedUrl();
    expect(url.pathname).toBe("/rest/v1/participations");
    expect(url.searchParams.get("select")).toBe("id");
    expect(url.searchParams.get("product_id")).toBe(`eq.${PRODUCT_ID}`);
    expect(url.searchParams.get("status")).toBe("eq.waitlisted");
    expect(url.searchParams.get("stripe_checkout_session_id")).toBe("not.is.null");
  });

  it("reports nobody when no waitlisted row was paid for", async () => {
    fetchMock.mockResolvedValue(postgrestJson([]));
    await expect(service.getWaitlistPaymentMarkers(PRODUCT_ID)).resolves.toEqual(
      [],
    );
  });
});
