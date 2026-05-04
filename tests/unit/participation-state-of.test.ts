import { describe, expect, it } from "vitest";
import { participationStateOf } from "@/lib/participation-state";

describe("participationStateOf", () => {
  it("waitlisted status returns 'waitlisted'", () => {
    expect(
      participationStateOf({ status: "waitlisted", group_id: null }),
    ).toBe("waitlisted");
    expect(
      participationStateOf({ status: "waitlisted", group_id: "any-group-id" }),
    ).toBe("waitlisted");
  });

  it("active without group is 'unassigned'", () => {
    expect(
      participationStateOf({ status: "active", group_id: null }),
    ).toBe("unassigned");
  });

  it("active with group is 'assigned'", () => {
    expect(
      participationStateOf({
        status: "active",
        group_id: "00000000-0000-0000-0000-000000000001",
      }),
    ).toBe("assigned");
  });
});
