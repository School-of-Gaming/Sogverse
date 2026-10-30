import { describe, expect, it } from "vitest";
import { resolveTopicPrep } from "@/lib/products/topic-prep";
import type { TopicPrepStep } from "@/lib/products/topics";
import type { ProductTopic } from "@/types";

/**
 * The "Before the first session" guide by delivery mode. Online and in person
 * are one list, filtered; a hybrid product, with gamers at a site and everyone
 * in the voice room, is two sections, the second for joining from home.
 */
const ROOM_STEP = "remoteSession";
const VENUE_STEP = "venueVoiceRoom";

function hybridPlan(topic: ProductTopic) {
  const plan = resolveTopicPrep(topic, "hybrid");
  if (plan?.form !== "hybrid") throw new Error(`${topic}: not a hybrid plan`);
  return plan;
}

const keys = (steps: readonly TopicPrepStep[]) => steps.map((s) => s.key);

describe("resolveTopicPrep by delivery mode", () => {
  it("sorts a topic with both scopes into the two hybrid sections", () => {
    const plan = hybridPlan("roblox_studio");
    expect(keys(plan.steps)).toEqual(["robloxStudioAccount", VENUE_STEP]);
    expect(keys(plan.homeSteps)).toEqual([
      "robloxStudioInstall",
      "robloxStudioTest",
      ROOM_STEP,
    ]);
  });

  it("opens a hybrid Minecraft guide on the venue step alone", () => {
    // No `always` steps: the login at the venue is ours, at home the family's.
    const plan = hybridPlan("minecraft_java");
    expect(keys(plan.steps)).toEqual([VENUE_STEP]);
    expect(keys(plan.homeSteps)).toEqual([
      "minecraftJavaAccount",
      "minecraftJavaInstall",
      "minecraftJavaLaunch",
      ROOM_STEP,
    ]);
  });

  it("gives a label-only topic the two shared steps on hybrid", () => {
    const plan = hybridPlan("esports");
    expect(keys(plan.steps)).toEqual([VENUE_STEP]);
    expect(keys(plan.homeSteps)).toEqual([ROOM_STEP]);
  });

  it("keeps a topic with only `always` steps in the first section", () => {
    const plan = hybridPlan("pokemon_go");
    expect(keys(plan.steps).at(-1)).toBe(VENUE_STEP);
    expect(keys(plan.homeSteps)).toEqual([ROOM_STEP]);
  });

  it("keeps online and in person as one filtered list", () => {
    const online = resolveTopicPrep("roblox_studio", "online");
    if (online?.form !== "full") throw new Error("not a full plan");
    expect(keys(online.steps)).toEqual([
      "robloxStudioAccount",
      "robloxStudioInstall",
      "robloxStudioTest",
      ROOM_STEP,
    ]);

    const inPerson = resolveTopicPrep("roblox_studio", "in_person");
    if (inPerson?.form !== "accountsOnly") throw new Error("not accounts-only");
    expect(keys(inPerson.steps)).toEqual(["robloxStudioAccount"]);
  });

  it("gives the three Minecraft topics the supplied note in person alone", () => {
    for (const topic of [
      "minecraft_java",
      "minecraft_education",
      "minecraft_bedrock",
    ] as const) {
      expect(resolveTopicPrep(topic, "in_person"), topic).toEqual({
        form: "suppliedNote",
      });
      expect(resolveTopicPrep(topic, "online")?.form, topic).toBe("full");
      expect(resolveTopicPrep(topic, "hybrid")?.form, topic).toBe("hybrid");
    }
  });

  it("gives a label-only topic no note in person", () => {
    expect(resolveTopicPrep("esports", "in_person")).toBeNull();
  });
});
