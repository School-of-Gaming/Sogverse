import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import en from "../../../../messages/en.json";
import {
  teamMemberHeadlineText,
  teamMemberPlainName,
  teamMemberSubline,
} from "@/components/team/team-name";
import {
  publicAdminProfile,
  publicGeduProfile,
} from "../../../mocks/team-profile";

const t = createTranslator({ locale: "en", messages: en, namespace: "team.profile" });

describe("a team member headed", () => {
  it("heads an admin with first name and nickname, the surname under the rule", () => {
    const admin = publicAdminProfile();
    expect(teamMemberHeadlineText(admin, t)).toBe("Laura Nightowl");
    expect(teamMemberSubline(admin, t)).toBe(
      "Laura Virtanen · Chief Executive Officer",
    );
  });

  it("heads a Gedu with first name and nickname, the role under the rule", () => {
    const gedu = publicGeduProfile();
    expect(teamMemberHeadlineText(gedu, t)).toBe("Eetu CreeperHug");
    expect(teamMemberSubline(gedu, t)).toBe("Gedu · Game Educator");
  });

  it("heads a person with no nickname by their first name alone", () => {
    expect(
      teamMemberHeadlineText(publicAdminProfile({ nickname: null }), t),
    ).toBe("Laura");
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
