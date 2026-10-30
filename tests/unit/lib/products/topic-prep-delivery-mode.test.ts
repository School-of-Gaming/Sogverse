import { describe, expect, it } from "vitest";
import { resolveTopicPrep } from "@/lib/products/topic-prep";
import type { TopicPrepPlan } from "@/lib/products/topics";
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

const keys = (steps: TopicPrepPlan["steps"]) => steps.map((s) => s.key);

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
    expect(resolveTopicPrep("minecraft_java", "in_person")).toBeNull();
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

  it("leaves online and in person as they were", () => {
    const online = resolveTopicPrep("roblox_studio", "online");
    expect(online?.form).toBe("full");
    expect(online && keys(online.steps)).toEqual([
      "robloxStudioAccount",
      "robloxStudioInstall",
      "robloxStudioTest",
      ROOM_STEP,
    ]);

    const inPerson = resolveTopicPrep("roblox_studio", "in_person");
    expect(inPerson?.form).toBe("accountsOnly");
    expect(inPerson && keys(inPerson.steps)).toEqual(["robloxStudioAccount"]);
  });
});
