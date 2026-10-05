import { describe, it, expect } from "vitest";
import {
  isPublicTeamPhotoUrl,
  publicTeamPhotoUrl,
} from "@/services/team-profiles/team-profiles.types";

/**
 * Which team photo addresses may go through the image optimiser. The portrait
 * decides from the address alone, so this is the whole of the rule: the public
 * route's address is optimised and cached for a year, and the editor's signed
 * URL to a private object and its local object URL never are.
 */
describe("isPublicTeamPhotoUrl", () => {
  it("accepts the address the public read hands out", () => {
    expect(
      isPublicTeamPhotoUrl(
        publicTeamPhotoUrl("3c3ca18c-c44b-40df-86f7-98ad3e277aba", "abc"),
      ),
    ).toBe(true);
  });

  it.each([
    "https://project.supabase.co/storage/v1/object/sign/team-photos/3c3ca18c-c44b-40df-86f7-98ad3e277aba/4b1f.jpg?token=secret",
    "blob:http://localhost:3000/5f0c1e2a-1b2c-4d5e-8f90-a1b2c3d4e5f6",
    "/preview-art/session-badge.jpg",
  ])("refuses %s", (src) => {
    expect(isPublicTeamPhotoUrl(src)).toBe(false);
  });
});
