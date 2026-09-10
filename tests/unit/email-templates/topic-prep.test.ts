import { describe, it, expect, beforeAll } from "vitest";
import {
  buildTopicPrepSection,
  topicPrepText,
} from "@/lib/email-templates/topic-prep";
import {
  getTopicPrepTranslator,
  type TopicPrepTranslator,
} from "@/lib/email-templates/translator";
import { resolveTopicPrep } from "@/lib/products/topics";
import type { ProductTopic } from "@/types";
import messages from "@/../messages/en.json";

// The mail's half of the "Before the first session" guide. What is worth
// asserting here is the two answers a caller cannot recover for itself: that
// there is genuinely *nothing* to state where nothing applies — a mail splices
// the string in raw, so a section label over a closing line would be furniture
// announcing that there is nothing to say — and that an in-person render drops
// exactly the steps School of Gaming is supplying the machines for.
//
// Both builders take a plan the caller resolved, which is what keeps the body
// and its plain-text twin stating one document. So the empty answer is the
// resolver's `null` rather than an empty string from either builder, and the
// helpers below make that split the shape of every case.

describe("topic prep email section", () => {
  let t: TopicPrepTranslator;

  beforeAll(async () => {
    t = await getTopicPrepTranslator("en");
  });

  /** The plan a caller resolves before composing anything. */
  function planFor(topic: ProductTopic, isRemote: boolean) {
    const plan = resolveTopicPrep(topic, isRemote);
    if (plan === null) {
      throw new Error(`no guide for ${topic} (isRemote: ${isRemote})`);
    }
    return plan;
  }

  const section = (topic: ProductTopic, isRemote: boolean) =>
    buildTopicPrepSection(t, planFor(topic, isRemote));
  const textLines = (topic: ProductTopic, isRemote: boolean) =>
    topicPrepText(t, planFor(topic, isRemote));

  it("has nothing to compose for a label-only topic in person", () => {
    // It brings no steps of its own, and in person there is no room to get
    // ready for either — so the mail says nothing rather than saying so, and
    // it never reaches either builder to find that out.
    expect(resolveTopicPrep("programming", false)).toBeNull();
  });

  it("gives a label-only topic the one-step guide on a remote product", () => {
    // The generic intro rather than a topic's: there is no
    // `topics.programming.intro` to reach for, and the plan's third form is
    // what stops the builder asking for one.
    const prep = messages.topicPrep;
    const html = section("programming", true);

    expect(html).toContain(prep.heading);
    expect(html).toContain(prep.remoteOnlyIntro);
    expect(html).toContain(prep.steps.remoteSession.title);
    expect(html).toContain(prep.closing);

    const lines = textLines("programming", true);
    expect(lines).toContain(`1. ${prep.steps.remoteSession.title}`);
    // One step and no second: the whole guide is the room.
    expect(lines.some((line) => line.startsWith("2. "))).toBe(false);
  });

  it("has nothing to compose for Minecraft Education in person", () => {
    // Its one step is an install, and in person we supply the machines and the
    // logins alike — so there is genuinely nothing for a family to do, and the
    // mail says nothing rather than saying so.
    expect(resolveTopicPrep("minecraft_education", false)).toBeNull();
    expect(section("minecraft_education", true)).not.toBe("");
  });

  it("renders the guide as a numbered list under a section label", () => {
    const html = section("roblox_studio", true);
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
    // The shared step every remote guide ends on, after the topic's own.
    expect(html).toContain(prep.steps.remoteSession.title);
    expect(html).toContain(prep.closing);
  });

  it("takes the accounts-only intro in person, and drops the install steps", () => {
    const html = section("roblox_studio", false);
    const prep = messages.topicPrep;

    expect(html).toContain(prep.accountsOnlyIntro.roblox_studio);
    expect(html).not.toContain(prep.topics.roblox_studio.intro);
    expect(html).toContain(prep.steps.robloxStudioAccount.title);
    expect(html).not.toContain(prep.steps.robloxStudioInstall.title);
    expect(html).not.toContain("https://create.roblox.com/");
    // No room to join at an in-person product, so no step about one.
    expect(html).not.toContain(prep.steps.remoteSession.title);
  });

  it("states one document in both forms, from one plan", () => {
    // The pair is what the single-resolve contract buys: the caller resolves
    // once and hands the same plan to both, so the HTML body and the twin an
    // Exchange mailbox reads cannot be filtered differently.
    const plan = planFor("roblox_studio", false);
    const html = buildTopicPrepSection(t, plan);
    const lines = topicPrepText(t, plan).join("\n");
    const prep = messages.topicPrep;

    expect(html).toContain(prep.steps.robloxStudioAccount.title);
    expect(lines).toContain(prep.steps.robloxStudioAccount.title);
    expect(html).not.toContain(prep.steps.robloxStudioInstall.title);
    expect(lines).not.toContain(prep.steps.robloxStudioInstall.title);
  });

  it("renders a message's own emphasis as weight, and strips it for the text twin", () => {
    const html = section("roblox_studio", false);
    expect(html).toContain("<strong");
    // The tag itself never reaches a reader in either medium.
    expect(html).not.toContain("<b>");

    const lines = textLines("roblox_studio", false).join("\n");
    expect(lines).not.toContain("<b>");
    expect(lines).not.toContain("<strong");
    expect(lines).toContain("Keep the password to yourselves");
  });

  it("states the same guide in the plain-text twin, numbered by hand", () => {
    // The twin has no list markup to number it, so the builder writes the
    // numbers — the one place they are written rather than the client's.
    const lines = textLines("roblox_studio", true);
    const prep = messages.topicPrep;

    expect(lines[0]).toBe(prep.heading);
    expect(lines).toContain(`1. ${prep.steps.robloxStudioAccount.title}`);
    expect(lines).toContain(`3. ${prep.steps.robloxStudioTest.title}`);
    expect(lines).toContain(
      `${prep.steps.robloxStudioInstall.linkLabel}: https://create.roblox.com/`,
    );
    expect(lines).toContain(`- ${prep.checklist.robloxStudioTestClose}`);
    // The shared step is numbered like any other, and it is the last one.
    expect(lines).toContain(`4. ${prep.steps.remoteSession.title}`);
    expect(lines.at(-1)).toBe(prep.closing);
  });

  it("keeps every Pokémon GO step in person", () => {
    // The phone is the family's wherever the session happens, so nothing
    // filters out and the guide takes its ordinary intro.
    const html = section("pokemon_go", false);
    const prep = messages.topicPrep;

    expect(html).toContain(prep.topics.pokemon_go.intro);
    expect(html).toContain(prep.steps.pokemonGoInstall.title);
    expect(html).toContain(prep.steps.pokemonGoAgree.title);
  });
});
