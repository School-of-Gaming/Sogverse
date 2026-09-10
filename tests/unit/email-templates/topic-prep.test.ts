import { describe, it, expect, beforeAll } from "vitest";
import {
  buildTopicPrepSection,
  topicPrepText,
} from "@/lib/email-templates/topic-prep";
import {
  getTopicPrepTranslator,
  type TopicPrepTranslator,
} from "@/lib/email-templates/translator";
import messages from "@/../messages/en.json";

// The mail's half of the "Before the first session" guide. What is worth
// asserting here is the two answers a caller cannot recover for itself: that
// the section is genuinely *empty* where nothing applies — a mail splices the
// string in raw, so a section label over a closing line would be furniture
// announcing that there is nothing to say — and that an in-person render drops
// exactly the steps School of Gaming is supplying the machines for.

describe("topic prep email section", () => {
  let t: TopicPrepTranslator;

  beforeAll(async () => {
    t = await getTopicPrepTranslator("en");
  });

  it("renders nothing for a topic with no guide", () => {
    expect(buildTopicPrepSection(t, "programming", true)).toBe("");
    expect(topicPrepText(t, "programming", true)).toEqual([]);
  });

  it("renders nothing for Minecraft Education in person", () => {
    // Its one step is an install, and in person we supply the machines and the
    // logins alike — so there is genuinely nothing for a family to do, and the
    // mail says nothing rather than saying so.
    expect(buildTopicPrepSection(t, "minecraft_education", false)).toBe("");
    expect(topicPrepText(t, "minecraft_education", false)).toEqual([]);

    expect(
      buildTopicPrepSection(t, "minecraft_education", true),
    ).not.toBe("");
  });

  it("renders the guide as a numbered list under a section label", () => {
    const html = buildTopicPrepSection(t, "roblox_studio", true);
    const prep = messages.topicPrep;

    expect(html).toContain(prep.heading);
    expect(html).toContain(prep.topics.roblox_studio.intro);
    expect(html).toContain("<ol");
    expect(html).toContain(prep.steps.robloxStudioAccount.title);
    expect(html).toContain(prep.steps.robloxStudioInstall.title);
    expect(html).toContain(prep.steps.robloxStudioTest.title);
    // The install step's literal URL, as an inline link rather than a button.
    expect(html).toContain("https://create.roblox.com/");
    expect(html).toContain(prep.steps.robloxStudioInstall.linkLabel);
    // Per-platform notes and the checklist, both declared in the registry.
    expect(html).toContain(prep.platformNotes.robloxStudioWindows.body);
    expect(html).toContain(prep.checklist.robloxStudioTestOpen);
    expect(html).toContain(prep.closing);
  });

  it("takes the accounts-only intro in person, and drops the install steps", () => {
    const html = buildTopicPrepSection(t, "roblox_studio", false);
    const prep = messages.topicPrep;

    expect(html).toContain(prep.accountsOnlyIntro.roblox_studio);
    expect(html).not.toContain(prep.topics.roblox_studio.intro);
    expect(html).toContain(prep.steps.robloxStudioAccount.title);
    expect(html).not.toContain(prep.steps.robloxStudioInstall.title);
    expect(html).not.toContain("https://create.roblox.com/");
  });

  it("renders a message's own emphasis as weight, and strips it for the text twin", () => {
    const html = buildTopicPrepSection(t, "roblox_studio", false);
    expect(html).toContain("<strong");
    // The tag itself never reaches a reader in either medium.
    expect(html).not.toContain("<b>");

    const lines = topicPrepText(t, "roblox_studio", false).join("\n");
    expect(lines).not.toContain("<b>");
    expect(lines).not.toContain("<strong");
    expect(lines).toContain("Keep the password to yourselves");
  });

  it("states the same guide in the plain-text twin, numbered by hand", () => {
    // The twin has no list markup to number it, so the builder writes the
    // numbers — the one place they are written rather than the client's.
    const lines = topicPrepText(t, "roblox_studio", true);
    const prep = messages.topicPrep;

    expect(lines[0]).toBe(prep.heading);
    expect(lines).toContain(`1. ${prep.steps.robloxStudioAccount.title}`);
    expect(lines).toContain(`3. ${prep.steps.robloxStudioTest.title}`);
    expect(lines).toContain(
      `${prep.steps.robloxStudioInstall.linkLabel}: https://create.roblox.com/`,
    );
    expect(lines).toContain(`- ${prep.checklist.robloxStudioTestClose}`);
    expect(lines.at(-1)).toBe(prep.closing);
  });

  it("keeps every Pokémon GO step in person", () => {
    // The phone is the family's wherever the session happens, so nothing
    // filters out and the guide takes its ordinary intro.
    const html = buildTopicPrepSection(t, "pokemon_go", false);
    const prep = messages.topicPrep;

    expect(html).toContain(prep.topics.pokemon_go.intro);
    expect(html).toContain(prep.steps.pokemonGoInstall.title);
    expect(html).toContain(prep.steps.pokemonGoAgree.title);
  });
});
