import { describe, it, expect } from "vitest";
import { orderSnapshotForDisplay } from "@/services/groups/groups.queries";
import type {
  GroupGeduDetail,
  GroupParticipationDetail,
  ProductGroupsSnapshot,
} from "@/types";

// orderSnapshotForDisplay is the single source of display order for the admin
// groups panel (applied in useProductGroups' select). The contract:
//   - groups by created_at, participations by updated_at, Gedus by assigned_at
//   - ascending (most-recently-touched last, matching the optimistic append)
//   - ties broken by id
//   - mixed "Z" / "+00:00" instant formats compare correctly

function participation(
  id: string,
  updatedAt: string,
): GroupParticipationDetail {
  return {
    id,
    gamer_id: `gamer-${id}`,
    gamer_first_name: id,
    gamer_date_of_birth: null,
    gamer_gender: null,
    gamer_minecraft_username: null,
    gamer_minecraft_uuid: null,
    gamer_parent_first_name: null,
    gamer_parent_last_name: null,
    status: "active",
    signed_up_at: "2026-01-01T00:00:00Z",
    updated_at: updatedAt,
  };
}

function gedu(id: string, assignedAt: string): GroupGeduDetail {
  return { id, first_name: id, email: null, assigned_at: assignedAt };
}

describe("orderSnapshotForDisplay", () => {
  it("orders participations by updated_at, most recent last", () => {
    const snapshot: ProductGroupsSnapshot = {
      product_id: "p1",
      groups: [
        {
          id: "g1",
          name: "Alpha",
          created_at: "2026-01-01T00:00:00Z",
          gedus: [],
          participations: [
            participation("late", "2026-03-01T00:00:00Z"),
            participation("early", "2026-01-01T00:00:00Z"),
            participation("mid", "2026-02-01T00:00:00Z"),
          ],
        },
      ],
      unassigned: [],
    };

    const ordered = orderSnapshotForDisplay(snapshot);
    expect(ordered.groups[0].participations.map((p) => p.id)).toEqual([
      "early",
      "mid",
      "late",
    ]);
  });

  it("orders unassigned by updated_at and Gedus by assigned_at", () => {
    const snapshot: ProductGroupsSnapshot = {
      product_id: "p1",
      groups: [
        {
          id: "g1",
          name: "Alpha",
          created_at: "2026-01-01T00:00:00Z",
          gedus: [
            gedu("newGedu", "2026-02-01T00:00:00Z"),
            gedu("oldGedu", "2026-01-01T00:00:00Z"),
          ],
          participations: [],
        },
      ],
      unassigned: [
        participation("u-late", "2026-03-01T00:00:00Z"),
        participation("u-early", "2026-01-01T00:00:00Z"),
      ],
    };

    const ordered = orderSnapshotForDisplay(snapshot);
    expect(ordered.groups[0].gedus.map((g) => g.id)).toEqual([
      "oldGedu",
      "newGedu",
    ]);
    expect(ordered.unassigned.map((p) => p.id)).toEqual(["u-early", "u-late"]);
  });

  it("orders groups by created_at", () => {
    const snapshot: ProductGroupsSnapshot = {
      product_id: "p1",
      groups: [
        {
          id: "gB",
          name: "B",
          created_at: "2026-02-01T00:00:00Z",
          gedus: [],
          participations: [],
        },
        {
          id: "gA",
          name: "A",
          created_at: "2026-01-01T00:00:00Z",
          gedus: [],
          participations: [],
        },
      ],
      unassigned: [],
    };

    expect(orderSnapshotForDisplay(snapshot).groups.map((g) => g.id)).toEqual([
      "gA",
      "gB",
    ]);
  });

  it("breaks ties by id and compares Z / +00:00 formats equally", () => {
    const snapshot: ProductGroupsSnapshot = {
      product_id: "p1",
      groups: [
        {
          id: "g1",
          name: "Alpha",
          created_at: "2026-01-01T00:00:00Z",
          gedus: [],
          // Same instant, expressed two ways — must order by id, not text.
          participations: [
            participation("b", "2026-01-01T00:00:00+00:00"),
            participation("a", "2026-01-01T00:00:00Z"),
          ],
        },
      ],
      unassigned: [],
    };

    expect(
      orderSnapshotForDisplay(snapshot).groups[0].participations.map(
        (p) => p.id,
      ),
    ).toEqual(["a", "b"]);
  });
});
