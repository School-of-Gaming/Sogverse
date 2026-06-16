import { describe, it, expect } from "vitest";
import type { VoiceZone } from "@/types";
import { composeZones, selfMovableZoneIds } from "@/lib/voice/zone-composition";
import {
  VOICE_ZONE_ICON_KEYS,
  VOICE_ZONE_COLOR_KEYS,
  pickRandomZoneAppearance,
} from "@/lib/constants/voice-zones";

function zone(overrides: Partial<VoiceZone> = {}): VoiceZone {
  return {
    id: "z-1",
    group_id: "g-1",
    name: "Zone 1",
    icon: "rocket",
    color: "red",
    is_locked: false,
    sort_order: 0,
    created_by: "u-1",
    created_at: "2026-06-16T10:00:00Z",
    updated_at: "2026-06-16T10:00:00Z",
    ...overrides,
  };
}

describe("composeZones", () => {
  it("instant rooms (null group) get lobby + 4 Yty only, ignoring custom rows", () => {
    const views = composeZones([zone()], null);
    expect(views).toHaveLength(5);
    expect(views.map((v) => v.id)).toEqual([
      "lobby",
      "yty-harmony",
      "yty-glow",
      "yty-valor",
      "yty-wit",
    ]);
    expect(views.every((v) => !v.isLocked)).toBe(true);
  });

  it("lobby is first and Yty zones carry translation keys", () => {
    const [lobby, harmony] = composeZones(null, "g-1");
    expect(lobby).toMatchObject({ id: "lobby", kind: "lobby", nameIsKey: true });
    expect(harmony).toMatchObject({ id: "yty-harmony", kind: "yty", nameIsKey: true });
  });

  it("group rooms append custom zones after the virtual ones", () => {
    const views = composeZones([zone({ id: "c-1", name: "Strategy" })], "g-1");
    expect(views).toHaveLength(6);
    const custom = views[5];
    expect(custom).toMatchObject({
      id: "c-1",
      kind: "custom",
      name: "Strategy",
      nameIsKey: false,
      isLocked: false,
    });
  });

  it("custom zones sort by sort_order, then created_at", () => {
    const a = zone({ id: "a", sort_order: 2, created_at: "2026-01-01T00:00:00Z" });
    const b = zone({ id: "b", sort_order: 1, created_at: "2026-01-02T00:00:00Z" });
    const c = zone({ id: "c", sort_order: 1, created_at: "2026-01-01T00:00:00Z" });
    const ids = composeZones([a, b, c], "g-1")
      .filter((v) => v.kind === "custom")
      .map((v) => v.id);
    // sort_order 1 before 2; within sort_order 1, earlier created_at first.
    expect(ids).toEqual(["c", "b", "a"]);
  });

  it("a locked custom zone is flagged isLocked", () => {
    const views = composeZones([zone({ id: "lz", is_locked: true })], "g-1");
    expect(views.find((v) => v.id === "lz")?.isLocked).toBe(true);
  });

  it("a blank (null) custom-zone name becomes an empty view name", () => {
    const views = composeZones([zone({ id: "c-1", name: null })], "g-1");
    expect(views.find((v) => v.id === "c-1")).toMatchObject({
      name: "",
      nameIsKey: false,
    });
  });
});

describe("pickRandomZoneAppearance", () => {
  it("always returns an icon and color from the palette", () => {
    const icons = new Set<string>(VOICE_ZONE_ICON_KEYS);
    const colors = new Set<string>(VOICE_ZONE_COLOR_KEYS);
    // Sample many rolls — every pick must be a valid palette member.
    for (let i = 0; i < 100; i++) {
      const got = pickRandomZoneAppearance();
      expect(icons.has(got.icon)).toBe(true);
      expect(colors.has(got.color)).toBe(true);
    }
  });
});

describe("selfMovableZoneIds", () => {
  it("excludes locked zones (placement there is mod-only)", () => {
    const views = composeZones(
      [zone({ id: "open" }), zone({ id: "locked", is_locked: true })],
      "g-1",
    );
    const ids = selfMovableZoneIds(views);
    expect(ids).toContain("open");
    expect(ids).toContain("lobby");
    expect(ids).not.toContain("locked");
  });
});
