import { beforeAll, describe, expect, it } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import { z } from "zod";
import {
  DISCORD_FLAG_IS_COMPONENTS_V2,
  buildFiledMessage,
  buildNoteModal,
  buildReasonStepMessage,
  buildRefusalMessage,
  buildSessionPickerMessage,
  buildSubPreviewSessions,
  buildNoticeMessage,
  discordSubLogoUrl,
  loadDiscordSubCopy,
  parseReasonValue,
  parseSessionValue,
  parseSubCustomId,
  type DiscordComponent,
  type DiscordComponentsMessage,
  type DiscordSubCopy,
} from "@/lib/discord-substitution-message";
import type { GeduUpcomingSession } from "@/lib/gedu-upcoming-sessions";

/**
 * The `/sub` command's messages, as the data Discord is sent. Pinned: the
 * custom_id scheme both ways round, the session list's weeks and pages, the
 * caps Discord refuses a message for exceeding, and that the admin preview is
 * the same builder with every control on the preview prefix.
 */

const GROUP_A = "6f1c2c1e-6d43-4c1a-9a5e-2f8f0d1b7a10";
const GROUP_B = "0b7e2a56-3c1d-4f7e-8a2b-9c4d5e6f7a81";
const TZ = "Europe/Helsinki";
/** A Monday morning in Helsinki. */
const NOW = new Date("2026-10-05T06:00:00Z");
const URL = "https://sogverse.sog.gg/gedu/substitutions";
const LOGO = "https://sogverse.sog.gg/apple-icon.png";

function session(
  groupId: string,
  sessionDate: string,
  overrides: Partial<GeduUpcomingSession> = {},
): GeduUpcomingSession {
  const startsAt = fromZonedTime(`${sessionDate}T16:00:00`, TZ);
  return {
    key: `${groupId}:${sessionDate}`,
    groupId,
    sessionDate,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 90 * 60_000),
    timezone: TZ,
    productId: groupId,
    productName: "Minecraft Club",
    productType: "consumer_club",
    groupName: "A",
    isRemote: false,
    siteName: "Kallio School",
    ...overrides,
  };
}

const componentList = z.array(z.record(z.unknown()));
const optionList = z.array(
  z.object({
    label: z.string(),
    description: z.string().optional(),
    value: z.string(),
    default: z.boolean().optional(),
  }),
);

/**
 * Every component in a message, depth first — through a container's, a
 * section's or a row's `components`, a label's single `component` and a
 * section's `accessory`.
 */
function walk(components: unknown): DiscordComponent[] {
  const list = componentList.safeParse(components);
  if (!list.success) return [];
  return list.data.flatMap((component) => [
    component,
    ...walk(component.components),
    ...walk(component.component === undefined ? [] : [component.component]),
    ...walk(component.accessory === undefined ? [] : [component.accessory]),
  ]);
}

const ofType = (message: DiscordComponentsMessage, type: number) =>
  walk(message.components).filter((component) => component.type === type);
const texts = (message: DiscordComponentsMessage) =>
  ofType(message, 10).map((component) => String(component.content));
const selects = (message: DiscordComponentsMessage) => ofType(message, 3);
const buttons = (message: DiscordComponentsMessage) => ofType(message, 2);
const options = (select: DiscordComponent) => optionList.parse(select.options);

let en: DiscordSubCopy;
let fi: DiscordSubCopy;
beforeAll(async () => {
  en = await loadDiscordSubCopy("en");
  fi = await loadDiscordSubCopy("fi");
});

describe("parseSubCustomId", () => {
  it.each([
    ["sub:p:0", { kind: "page", page: 0 }],
    ["sub:p:3", { kind: "page", page: 3 }],
    ["sub:s:2026-10-05:0", { kind: "session" }],
    [`sub:r:${GROUP_A}:2026-10-06`, { kind: "reason", groupId: GROUP_A, sessionDate: "2026-10-06" }],
    [
      `sub:m:${GROUP_A}:2026-10-06:sick:fi`,
      { kind: "note", groupId: GROUP_A, sessionDate: "2026-10-06", reason: "sick", locale: "fi" },
    ],
    [`sub:f:${GROUP_A}:2026-10-06:other`, { kind: "file", groupId: GROUP_A, sessionDate: "2026-10-06", reason: "other" }],
    [`sub:n:${GROUP_A}:2026-10-06:sick`, { kind: "submit", groupId: GROUP_A, sessionDate: "2026-10-06", reason: "sick" }],
    ["subpreview:s:2026-10-05:0", { kind: "preview" }],
    ["subpreview:p:1", { kind: "preview" }],
  ])("reads %s", (customId, expected) => {
    expect(parseSubCustomId(customId)).toEqual(expected);
  });

  it.each([
    "other:p:0",
    "sub:p:-1",
    "sub:p:x",
    "sub:x",
    `sub:r:not-a-uuid:2026-10-06`,
    `sub:r:${GROUP_A}:06.10.2026`,
    `sub:f:${GROUP_A}:2026-10-06:-`,
    `sub:f:${GROUP_A}:2026-10-06:holiday`,
    `sub:m:${GROUP_A}:2026-10-06:sick:de`,
    `sub:n:${GROUP_A}:2026-10-06:sick:extra`,
  ])("refuses %s", (customId) => {
    expect(parseSubCustomId(customId)).toBeNull();
  });

  it("reads a picked session and a picked reason, and nothing else", () => {
    expect(parseSessionValue(`${GROUP_A}:2026-10-06`)).toEqual({
      groupId: GROUP_A,
      sessionDate: "2026-10-06",
    });
    expect(parseSessionValue(`${GROUP_A}:2026-10-06:x`)).toBeNull();
    expect(parseSessionValue("nonsense")).toBeNull();
    expect(parseReasonValue("sick")).toBe("sick");
    expect(parseReasonValue("bored")).toBeNull();
  });
});

describe("buildSessionPickerMessage", () => {
  // Two this week, one next week, and three later weeks.
  const sessions = [
    session(GROUP_A, "2026-10-06"),
    session(GROUP_B, "2026-10-08", { isRemote: true, siteName: null, groupName: null, productName: "Roblox Studio" }),
    session(GROUP_A, "2026-10-13"),
    session(GROUP_A, "2026-10-20"),
    session(GROUP_A, "2026-10-27"),
    session(GROUP_A, "2026-11-03"),
  ];

  it("is one Components V2 container in the act colour", () => {
    const message = buildSessionPickerMessage({ copy: en, logoUrl: LOGO, sessions, now: NOW, page: 0, substitutionsUrl: URL });

    expect(message.flags).toBe(DISCORD_FLAG_IS_COMPONENTS_V2);
    expect(message.components).toHaveLength(1);
    expect(message.components[0]).toMatchObject({ type: 17, accent_color: 0xfaa901 });
    expect(texts(message)).toEqual(
      expect.arrayContaining([
        "### Which session can’t you make?",
        "Pick the session you can’t make. Your reason and note are shown to admins only.",
      ]),
    );
  });

  it("opens on this week and next, one select a week, with the way to later weeks", () => {
    const message = buildSessionPickerMessage({ copy: en, logoUrl: LOGO, sessions, now: NOW, page: 0, substitutionsUrl: URL });

    expect(texts(message)).toEqual(expect.arrayContaining(["**This week**", "**Next week**"]));
    const [thisWeek, nextWeek] = selects(message);
    expect(selects(message)).toHaveLength(2);
    expect(thisWeek.custom_id).toBe("sub:s:2026-10-05:0");
    expect(nextWeek.custom_id).toBe("sub:s:2026-10-12:0");
    expect(options(thisWeek)).toEqual([
      {
        label: "Tue, Oct 6, 16:00 – 17:30 GMT+3",
        description: "Minecraft Club — A · Kallio School",
        value: `${GROUP_A}:2026-10-06`,
      },
      {
        label: "Thu, Oct 8, 16:00 – 17:30 GMT+3",
        description: "Roblox Studio · Remote",
        value: `${GROUP_B}:2026-10-08`,
      },
    ]);
    expect(buttons(message).map((button) => [button.custom_id, button.label])).toEqual([
      ["sub:p:1", "Show later sessions"],
    ]);
  });

  it("pages the later weeks two at a time, with the way back", () => {
    const second = buildSessionPickerMessage({ copy: en, logoUrl: LOGO, sessions, now: NOW, page: 1, substitutionsUrl: URL });
    expect(selects(second).map((select) => select.custom_id)).toEqual([
      "sub:s:2026-10-19:0",
      "sub:s:2026-10-26:0",
    ]);
    expect(texts(second)).toEqual(expect.arrayContaining(["**Week of Oct 19**"]));
    expect(buttons(second).map((button) => button.custom_id)).toEqual(["sub:p:0", "sub:p:2"]);

    const last = buildSessionPickerMessage({ copy: en, logoUrl: LOGO, sessions, now: NOW, page: 9, substitutionsUrl: URL });
    expect(selects(last).map((select) => select.custom_id)).toEqual(["sub:s:2026-11-02:0"]);
    expect(buttons(last).map((button) => button.custom_id)).toEqual(["sub:p:1"]);
  });

  it("splits a week past Discord's 25 options into a second select", () => {
    const crowded = Array.from({ length: 30 }, (_, index) =>
      session(
        `${GROUP_A.slice(0, -2)}${String(index).padStart(2, "0")}`,
        index % 2 === 0 ? "2026-10-06" : "2026-10-07",
      ),
    );
    const message = buildSessionPickerMessage({ copy: en, logoUrl: LOGO, sessions: crowded, now: NOW, page: 0, substitutionsUrl: URL });

    expect(selects(message).map((select) => options(select).length)).toEqual([25, 5]);
    // Discord refuses a Components V2 message of more than 40 components.
    expect(walk(message.components).length).toBeLessThanOrEqual(40);
    expect(selects(message).map((select) => select.custom_id)).toEqual([
      "sub:s:2026-10-05:0",
      "sub:s:2026-10-05:1",
    ]);
  });

  it("stays inside Discord's caps on every id and option", () => {
    const long = session(GROUP_A, "2026-10-06", {
      productName: "A product name long enough that the row would run past a hundred characters",
      groupName: "and a group name to push it further still",
    });
    const message = buildSessionPickerMessage({ copy: en, logoUrl: LOGO, sessions: [long], now: NOW, page: 0, substitutionsUrl: URL });

    for (const component of walk(message.components)) {
      if (typeof component.custom_id === "string") {
        expect(component.custom_id.length).toBeLessThanOrEqual(100);
      }
    }
    const [option] = options(selects(message)[0]);
    expect(option.description?.length).toBe(100);
    expect(option.description?.endsWith("…")).toBe(true);
  });

  it("says there is nothing to file for and points at the web page", () => {
    const message = buildSessionPickerMessage({ copy: en, logoUrl: LOGO, sessions: [], now: NOW, page: 0, substitutionsUrl: URL });

    expect(selects(message)).toHaveLength(0);
    expect(texts(message).join("\n")).toContain(URL);
  });

  it("speaks the copy's locale", () => {
    const message = buildSessionPickerMessage({ copy: fi, logoUrl: LOGO, sessions, now: NOW, page: 0, substitutionsUrl: URL });

    expect(texts(message)).toEqual(
      expect.arrayContaining(["### Mille kerralle et pääse?", "**Tämä viikko**"]),
    );
  });
});

describe("the admin preview", () => {
  it("is the same first step over sample sessions, every control on the preview prefix", () => {
    const sessions = buildSubPreviewSessions(NOW);
    const message = buildSessionPickerMessage({
      copy: en,
      logoUrl: LOGO,
      sessions,
      now: NOW,
      page: 0,
      prefix: "subpreview",
      substitutionsUrl: URL,
    });

    const controls = [...selects(message), ...buttons(message)];
    expect(controls.length).toBeGreaterThan(1);
    for (const control of controls) {
      expect(parseSubCustomId(String(control.custom_id))).toEqual({ kind: "preview" });
    }
    // Enough weeks that the later-sessions button has somewhere to go.
    expect(buttons(message).map((button) => button.custom_id)).toContain("subpreview:p:1");
  });
});

describe("the reason step", () => {
  const picked = session(GROUP_A, "2026-10-06");

  it("asks the web form's question, with nothing chosen and both ways to finish disabled", () => {
    const message = buildReasonStepMessage({ copy: en, logoUrl: LOGO, session: picked, reason: null });

    expect(texts(message)).toEqual(
      expect.arrayContaining([
        "### I can’t make this session",
        "**Tue, Oct 6, 16:00 – 17:30 GMT+3**\nMinecraft Club — A\n-# Kallio School",
      ]),
    );
    const [reasons] = selects(message);
    expect(reasons.custom_id).toBe(`sub:r:${GROUP_A}:2026-10-06`);
    expect(options(reasons)).toEqual([
      { label: "Sick", value: "sick" },
      { label: "Something else", value: "other" },
    ]);
    expect(buttons(message).map((button) => [button.label, button.disabled ?? false])).toEqual([
      ["Back", false],
      ["Add a note", true],
      ["Confirm without a note", true],
    ]);
  });

  it("keeps the chosen reason and enables the note and the confirm", () => {
    const message = buildReasonStepMessage({ copy: fi, logoUrl: LOGO, session: picked, reason: "sick" });

    expect(options(selects(message)[0])[0]).toMatchObject({ value: "sick", default: true });
    const [back, note, confirm] = buttons(message);
    expect(parseSubCustomId(String(back.custom_id))).toEqual({ kind: "page", page: 0 });
    expect(parseSubCustomId(String(note.custom_id))).toEqual({
      kind: "note",
      groupId: GROUP_A,
      sessionDate: "2026-10-06",
      reason: "sick",
      locale: "fi",
    });
    expect(parseSubCustomId(String(confirm.custom_id))).toEqual({
      kind: "file",
      groupId: GROUP_A,
      sessionDate: "2026-10-06",
      reason: "sick",
    });
    expect(note.disabled).toBeUndefined();
  });

  it("opens a modal with the web form's note field and bound", () => {
    const modal = buildNoteModal({ copy: en, groupId: GROUP_A, sessionDate: "2026-10-06", reason: "other" });

    expect(parseSubCustomId(modal.custom_id)).toEqual({
      kind: "submit",
      groupId: GROUP_A,
      sessionDate: "2026-10-06",
      reason: "other",
    });
    expect(modal.title).toBe("I can’t make this session");
    expect(modal.components[0]).toMatchObject({
      type: 18,
      label: "Note for the office",
      component: { type: 4, custom_id: "note", required: false, max_length: 500 },
    });
  });

  it("fits every locale's modal title and label inside Discord's 45", async () => {
    for (const locale of ["en", "fi", "sv", "fr", "tlh"] as const) {
      const modal = buildNoteModal({
        copy: await loadDiscordSubCopy(locale),
        groupId: GROUP_A,
        sessionDate: "2026-10-06",
        reason: "sick",
      });
      expect(modal.title.length).toBeLessThanOrEqual(45);
      expect(String(modal.components[0].label).length).toBeLessThanOrEqual(45);
      expect(modal.title.endsWith("…")).toBe(false);
    }
  });
});

describe("the outcome", () => {
  const picked = session(GROUP_A, "2026-10-06");

  it("confirms in the web's own words", () => {
    const message = buildFiledMessage({ copy: en, logoUrl: LOGO, session: picked });

    expect(texts(message).join("\n")).toContain(
      "Substitute requested for Minecraft Club — A on Tue, Oct 6, 16:00 – 17:30 GMT+3.",
    );
    expect(buttons(message)).toHaveLength(0);
  });

  it("says why it was refused, with the way back to the list", () => {
    const message = buildRefusalMessage({
      copy: en,
      logoUrl: LOGO,
      line: en.form("substitutionRequestFailedAlreadyAsked"),
      session: picked,
    });

    expect(texts(message).join("\n")).toContain(
      "You’ve already asked for a substitute for this session.",
    );
    expect(buttons(message).map((button) => button.custom_id)).toEqual(["sub:p:0"]);
  });
});

describe("the logo", () => {
  const picked = session(GROUP_A, "2026-10-06");
  const sessions = [picked, session(GROUP_A, "2026-10-20")];

  const steps: Array<[string, (logoUrl: string | null) => DiscordComponentsMessage]> = [
    ["the first step", (logoUrl) => buildSessionPickerMessage({ copy: en, logoUrl, sessions, now: NOW, page: 0, substitutionsUrl: URL })],
    ["a later page", (logoUrl) => buildSessionPickerMessage({ copy: en, logoUrl, sessions, now: NOW, page: 1, substitutionsUrl: URL })],
    ["the empty list", (logoUrl) => buildSessionPickerMessage({ copy: en, logoUrl, sessions: [], now: NOW, page: 0, substitutionsUrl: URL })],
    [
      "the preview",
      (logoUrl) =>
        buildSessionPickerMessage({
          copy: en,
          logoUrl,
          sessions,
          now: NOW,
          page: 0,
          prefix: "subpreview",
          substitutionsUrl: URL,
        }),
    ],
    ["the reason step", (logoUrl) => buildReasonStepMessage({ copy: en, logoUrl, session: picked, reason: null })],
    ["the filed line", (logoUrl) => buildFiledMessage({ copy: en, logoUrl, session: picked })],
    ["a refusal", (logoUrl) => buildRefusalMessage({ copy: en, logoUrl, line: "No.", session: null })],
    ["a notice", (logoUrl) => buildNoticeMessage({ copy: en, logoUrl, line: "Hello." })],
  ];

  const containerChildren = (message: DiscordComponentsMessage) =>
    componentList.parse(message.components[0].components);

  it.each(steps)("heads %s with a section, the logo beside the brand line", (_, build) => {
    const [header] = containerChildren(build(LOGO));

    expect(header.type).toBe(9);
    expect(header.accessory).toEqual({ type: 11, media: { url: LOGO } });
    const lines = componentList.parse(header.components);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines.every((line) => line.type === 10)).toBe(true);
    expect(lines[0].content).toBe("-# School of Gaming · Substitutions");
  });

  it.each(steps)("heads %s with plain lines when there is no logo", (_, build) => {
    const bare = build(null);
    const withLogo = build(LOGO);

    expect(ofType(bare, 9)).toHaveLength(0);
    expect(ofType(bare, 11)).toHaveLength(0);
    expect(containerChildren(bare)[0]).toEqual({
      type: 10,
      content: "-# School of Gaming · Substitutions",
    });
    // The same lines and controls, only unwrapped.
    expect(texts(bare)).toEqual(texts(withLogo));
    expect([...selects(bare), ...buttons(bare)]).toEqual([...selects(withLogo), ...buttons(withLogo)]);
  });

  it("puts the step's heading beside the logo", () => {
    const message = buildReasonStepMessage({ copy: en, logoUrl: LOGO, session: picked, reason: null });
    const [header] = containerChildren(message);

    expect(componentList.parse(header.components).map((line) => line.content)).toEqual([
      "-# School of Gaming · Substitutions",
      "### I can’t make this session",
    ]);
  });

  it("is the favicon on the origin it is given, and nothing without one", () => {
    expect(discordSubLogoUrl("https://sogverse-staging.sog.gg")).toBe(
      "https://sogverse-staging.sog.gg/apple-icon.png",
    );
    expect(discordSubLogoUrl(null)).toBeNull();
  });
});
