import { describe, it, expect } from "vitest";

import { assembleFamilies } from "@/services/partner/partner-families.server";

const P1 = "30000000-0000-4000-8000-000000000001";
const P2 = "30000000-0000-4000-8000-000000000002";
const P3 = "30000000-0000-4000-8000-000000000003";
const G1 = "20000000-0000-4000-8000-000000000001";
const G2 = "20000000-0000-4000-8000-000000000002";
const G3 = "20000000-0000-4000-8000-000000000003";

const gamerSeat = (gamer: string, parent: string) => ({
  participant_id: gamer,
  customer_id: parent,
});
const ownSeat = (parent: string) => ({ participant_id: parent, customer_id: parent });

describe("assembleFamilies", () => {
  it("answers no families for no seats", () => {
    expect(assembleFamilies([], [])).toEqual([]);
  });

  it("makes a parent on their own seat a family with no gamers", () => {
    expect(assembleFamilies([ownSeat(P1)], [])).toEqual([{ parentIds: [P1], gamerIds: [] }]);
  });

  it("puts a seated gamer in a family with every parent linked to them", () => {
    expect(
      assembleFamilies(
        [gamerSeat(G1, P2), gamerSeat(G1, P2)],
        [
          { parent_id: P2, gamer_id: G1 },
          { parent_id: P1, gamer_id: G1 },
        ],
      ),
    ).toEqual([{ parentIds: [P1, P2], gamerIds: [G1] }]);
  });

  it("joins a parent's own seat to the family of their seated gamer", () => {
    expect(
      assembleFamilies([ownSeat(P1), gamerSeat(G1, P1)], [{ parent_id: P1, gamer_id: G1 }]),
    ).toEqual([{ parentIds: [P1], gamerIds: [G1] }]);
  });

  it("connects families only through in-scope gamers", () => {
    // P1 and P2 share G3, but G3 holds no seat: they stay two families, and G3
    // appears in neither.
    const families = assembleFamilies(
      [gamerSeat(G1, P1), gamerSeat(G2, P2)],
      [
        { parent_id: P1, gamer_id: G1 },
        { parent_id: P2, gamer_id: G2 },
        { parent_id: P1, gamer_id: G3 },
        { parent_id: P2, gamer_id: G3 },
      ],
    );
    expect(families).toEqual([
      { parentIds: [P1], gamerIds: [G1] },
      { parentIds: [P2], gamerIds: [G2] },
    ]);
  });

  it("follows a chain of shared gamers into one family", () => {
    // P3–G1–P1 and P1–G2–P2: one component, keyed on its smallest parent.
    const families = assembleFamilies(
      [gamerSeat(G2, P2), gamerSeat(G1, P3)],
      [
        { parent_id: P3, gamer_id: G1 },
        { parent_id: P1, gamer_id: G1 },
        { parent_id: P1, gamer_id: G2 },
        { parent_id: P2, gamer_id: G2 },
      ],
    );
    expect(families).toEqual([{ parentIds: [P1, P2, P3], gamerIds: [G1, G2] }]);
  });

  it("leaves out a seated gamer with no parent link", () => {
    expect(assembleFamilies([gamerSeat(G1, P1), ownSeat(P2)], [])).toEqual([
      { parentIds: [P2], gamerIds: [] },
    ]);
  });

  it("orders families by their smallest parent id, whatever the seat order", () => {
    const families = assembleFamilies(
      [ownSeat(P3), gamerSeat(G2, P2), ownSeat(P1)],
      [{ parent_id: P2, gamer_id: G2 }],
    );
    expect(families.map((family) => family.parentIds[0])).toEqual([P1, P2, P3]);
  });
});
