import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DARK_THEME } from "@/lib/constants/colors";
import {
  TEAM_CARD_HEADLINE_MAX,
  TEAM_CARD_HEADLINE_MIN,
  teamCardFrame,
  teamCardGlow,
  teamCardHeadlineSize,
  teamCardUrl,
  teamCardVersion,
  ZONE_GLOW_GEOMETRY,
} from "@/lib/og/team-card";
import type { TeamProfile } from "@/services/team-profiles/team-profiles.types";
import {
  publicAdminProfile,
  publicGeduProfile,
  teamTranslation,
} from "../../mocks/team-profile";

describe("a team card's version", () => {
  const admin = publicAdminProfile({ locales: ["en", "fi"] });
  const base = teamCardVersion(admin, "en");

  // Every field the card draws at English. Each must move the version, or a
  // preview that cached the old card keeps showing it under the same URL.
  const shownChanges: [string, TeamProfile][] = [
    ["first name", { ...admin, firstName: "Liisa" }],
    ["nickname", { ...admin, nickname: "Earlybird" }],
    ["no nickname", { ...admin, nickname: null }],
    ["last name", { ...admin, lastName: "Korhonen" }],
    ["title", { ...admin, title: "Head of Clubs" }],
    ["pick", { ...admin, pick: 13 }],
    [
      "photo",
      {
        ...admin,
        photo: { src: `/api/team/photos/${admin.id}?v=new`, width: 800, height: 1000 },
      },
    ],
    [
      "intro",
      {
        ...admin,
        translations: [
          { ...teamTranslation("en"), shortDescription: "A new intro" },
          teamTranslation("fi"),
        ],
      },
    ],
    ["role", { ...publicGeduProfile({ id: admin.id }), firstName: admin.firstName }],
  ];

  it.each(shownChanges)("changes when the %s changes", (_field, changed) => {
    expect(teamCardVersion(changed, "en")).not.toBe(base);
  });

  it("holds still for what the card does not show", () => {
    expect(
      teamCardVersion(
        {
          ...admin,
          spokenLanguages: ["sv"],
          translations: [
            { ...teamTranslation("en"), longDescription: "Rewritten", funFact: "New" },
            { ...teamTranslation("fi"), shortDescription: "Uusi esittely" },
          ],
        },
        "en",
      ),
    ).toBe(base);
  });

  it("follows the intro the locale resolves to", () => {
    // Finnish is written, so it has its own; Swedish falls back to English.
    expect(teamCardVersion(admin, "fi")).not.toBe(base);
    expect(teamCardVersion(admin, "sv")).toBe(base);
  });

  it("is carried in the card's URL with the locale", () => {
    expect(teamCardUrl(admin, "fi")).toBe(
      `/opengraph-images/team/${admin.id}?locale=fi&v=${teamCardVersion(admin, "fi")}`,
    );
  });
});

describe("the team card's headline size", () => {
  it("is the full size for a name that fits", () => {
    expect(teamCardHeadlineSize("Laura Nightowl")).toBe(TEAM_CARD_HEADLINE_MAX);
  });

  it("shrinks a long name to fit rather than wrapping it", () => {
    const size = teamCardHeadlineSize("Maximilian XxDragonSlayer");
    expect(size).toBeLessThan(TEAM_CARD_HEADLINE_MAX);
    expect(size).toBeGreaterThanOrEqual(TEAM_CARD_HEADLINE_MIN);
  });

  it("never shrinks below the floor", () => {
    expect(teamCardHeadlineSize("x".repeat(200))).toBe(TEAM_CARD_HEADLINE_MIN);
  });

  it("shrinks the rich seed's long-named Gedu, and keeps her above the floor", () => {
    // The seed gives Aino a nickname long enough to show the shrink on a
    // local stack; read from the seed, so a renamed nickname cannot quietly
    // stop doing that.
    const seed = readFileSync(
      join(process.cwd(), "supabase", "rich-seed.sql"),
      "utf8",
    );
    const nickname = /p_user_id\s*=>\s*v_aino,[\s\S]*?p_nickname\s*=>\s*'([^']+)'/.exec(
      seed,
    )?.[1];
    expect(nickname).toBeDefined();

    const size = teamCardHeadlineSize(`Aino ${nickname}`);
    expect(size).toBeLessThan(TEAM_CARD_HEADLINE_MAX);
    expect(size).toBeGreaterThan(TEAM_CARD_HEADLINE_MIN);
  });
});

describe("the team card's glow", () => {
  it("mirrors the geometry of .zone-glow in globals.css", () => {
    // The card restates the voice zones' glow as an inline style, because its
    // renderer reads no stylesheet. If the rule changes, this fails until the
    // constant says the same thing again.
    const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");
    const rule = /\.zone-glow\s*\{\s*box-shadow:\s*([^;]+);/.exec(css)?.[1];
    expect(rule).toBe(
      `inset 0 0 ${ZONE_GLOW_GEOMETRY.blurRem}rem ${ZONE_GLOW_GEOMETRY.spreadRem}rem var(--glow-color, transparent)`,
    );
  });

  it("is that geometry, scaled, as an inset shadow in the given colour", () => {
    expect(teamCardGlow("#A36BF6")).toBe("inset 0 0 48px -9.6px #A36BF6");
  });
});

describe("the team card's portrait frame", () => {
  it("is edged in the person's pick and glows with it", () => {
    expect(teamCardFrame(6)).toEqual({
      border: "6px solid #46CF5A",
      boxShadow: teamCardGlow("#46CF5A"),
    });
  });

  it("is the profile page's neutral edge, with no glow, for a person with no pick", () => {
    // No shadow at all, not an empty one: the renderer refuses that.
    expect(teamCardFrame(null)).toStrictEqual({
      border: `6px solid ${DARK_THEME.border}`,
    });
  });
});
