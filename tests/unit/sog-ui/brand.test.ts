import { describe, expect, it } from "vitest";

import {
  BRAND,
  LORE_LEVELS,
  NEUTRALS,
  RADIUS_SCALE,
  STATUS,
  TONE_TO_FAMILY,
  TONES,
  YTY_FAMILIES,
  isYtyFamilyId,
} from "../../../packages/sog-ui/src/tokens/brand";

/**
 * The shape rules the colour source is held to.
 *
 * Every one of these would otherwise be a convention somebody remembers: a hex
 * typed in lowercase, a family whose two variants are the same colour, a tone
 * word with nothing behind it. They are cheap to check and each has a way of
 * going wrong quietly.
 */

const HEX = /^#[0-9A-F]{6}$/;

/** Every hex the module ships, labelled by where it came from. */
const allHexes: [string, string][] = [
  ...Object.entries(NEUTRALS).map<[string, string]>(([id, n]) => [
    `NEUTRALS.${id}`,
    n.hex,
  ]),
  ...Object.entries(BRAND).flatMap<[string, string]>(([id, b]) => [
    [`BRAND.${id}.hex`, b.hex],
    [`BRAND.${id}.foreground`, b.foreground],
  ]),
  ...Object.entries(YTY_FAMILIES).flatMap<[string, string]>(([id, f]) => [
    [`YTY_FAMILIES.${id}.strong`, f.strong],
    [`YTY_FAMILIES.${id}.soft`, f.soft],
  ]),
  ...Object.entries(STATUS).flatMap<[string, string]>(([id, s]) => [
    [`STATUS.${id}.hex`, s.hex],
    [`STATUS.${id}.foreground`, s.foreground],
  ]),
];

describe("brand colours", () => {
  it.each(allHexes)(
    "%s is an uppercase six-digit hex",
    (_label, hex) => {
      expect(hex).toMatch(HEX);
    },
  );

  it("gives every Yty family two distinguishable variants", () => {
    for (const [id, family] of Object.entries(YTY_FAMILIES)) {
      expect(family.strong, `${id} strong and soft are the same colour`).not.toBe(
        family.soft,
      );
    }
  });

  it("maps every tone to a family that exists", () => {
    expect(Object.keys(TONE_TO_FAMILY).sort()).toEqual([...TONES].sort());
    for (const tone of TONES) {
      const family = TONE_TO_FAMILY[tone];
      const known = isYtyFamilyId(family)
        ? family in YTY_FAMILIES
        : family in BRAND;
      expect(known, `tone "${tone}" maps to unknown family "${family}"`).toBe(
        true,
      );
    }
  });

  it("gives every tone its own family — no hue means two things", () => {
    const families = TONES.map((tone) => TONE_TO_FAMILY[tone]);
    expect(new Set(families).size).toBe(families.length);
  });

  it("names the token each neutral's text reads from", () => {
    for (const [id, neutral] of Object.entries(NEUTRALS)) {
      expect(NEUTRALS, `${id}.on names a token that does not exist`).toHaveProperty(
        neutral.on,
      );
    }
  });

  it("keeps the radius scale ascending and positive", () => {
    const pxs = RADIUS_SCALE.map((step) => step.px);
    expect(pxs.every((px) => px > 0)).toBe(true);
    expect([...pxs].sort((a, b) => a - b)).toEqual(pxs);
  });

  it("rations colour across all three lore levels", () => {
    expect(LORE_LEVELS.map((level) => level.id)).toEqual(["0-1", "2", "3"]);
  });
});
