import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import en from "../../../../messages/en.json";
import {
  teamMemberPlainName,
  teamMemberSubline,
} from "@/components/team/team-name";
import {
  publicAdminProfile,
  publicGeduProfile,
} from "../../../mocks/team-profile";

const t = createTranslator({ locale: "en", messages: en, namespace: "team.profile" });

describe("a team member headed", () => {
  it("heads an admin with their surname under the rule", () => {
    expect(teamMemberSubline(publicAdminProfile(), t)).toBe(
      "Laura Virtanen · Chief Executive Officer",
    );
  });

  it("heads a Gedu with their role under the rule", () => {
    expect(teamMemberSubline(publicGeduProfile(), t)).toBe("Gedu · Game Educator");
  });
});

describe("a team member's full name as plain text", () => {
  it("names an admin in full, the nickname in quotes", () => {
    expect(teamMemberPlainName(publicAdminProfile(), t)).toBe(
      "Laura “Nightowl” Virtanen",
    );
    expect(
      teamMemberPlainName(publicAdminProfile({ nickname: null }), t),
    ).toBe("Laura Virtanen");
  });

  it("never gives a Gedu a surname", () => {
    expect(teamMemberPlainName(publicGeduProfile(), t)).toBe("Eetu “CreeperHug”");
  });
});
