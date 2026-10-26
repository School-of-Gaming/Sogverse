import { describe, expect, it, vi } from "vitest";
import type { DeliveryMode } from "@/types";

/**
 * The "Before the first session" guide asks a product's delivery mode two
 * separate questions, each through its own helper: whether the family brings
 * their own machine (the install-and-test steps) and whether there is a voice
 * room (the shared mic-and-camera step).
 *
 * This file pins that they are two inputs and not one. It answers the first
 * question the other way for hybrid — what changing that helper's answer would
 * do — and checks that only the install-and-test half of a hybrid guide moves,
 * with the voice-room step staying exactly where the room puts it.
 */
vi.mock("@/lib/products/delivery-mode", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/products/delivery-mode")>();
  return {
    ...actual,
    familyBringsOwnMachine: (mode: DeliveryMode) => mode === "online",
  };
});

const { resolveTopicPrep } = await import("@/lib/products/topic-prep");

const ROOM_STEP = "remoteSession";

describe("resolveTopicPrep's two inputs", () => {
  it("keeps the room step on hybrid when the family does not bring a machine", () => {
    // Accounts only, as in person, then the room — the room comes from
    // `hasVoiceRoom`, not from the machine question.
    const plan = resolveTopicPrep("roblox_studio", "hybrid");
    expect(plan?.form).toBe("accountsOnly");
    expect(plan?.steps.map((s) => s.key)).toEqual([
      "robloxStudioAccount",
      ROOM_STEP,
    ]);
  });

  it("gives a topic whose every step is filtered out the room step alone", () => {
    // In person the Minecraft topics have nothing to say; with a room there is
    // still the room to get ready for, under the generic intro.
    expect(resolveTopicPrep("minecraft_java", "in_person")).toBeNull();
    const plan = resolveTopicPrep("minecraft_java", "hybrid");
    expect(plan?.form).toBe("remoteOnly");
    expect(plan?.steps.map((s) => s.key)).toEqual([ROOM_STEP]);
  });

  it("leaves online and in person as they were", () => {
    expect(resolveTopicPrep("roblox_studio", "online")?.form).toBe("full");
    expect(resolveTopicPrep("roblox_studio", "in_person")?.steps.map((s) => s.key)).toEqual([
      "robloxStudioAccount",
    ]);
  });
});
