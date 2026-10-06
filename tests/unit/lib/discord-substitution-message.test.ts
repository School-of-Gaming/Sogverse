import { beforeAll, describe, expect, it } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import { z } from "zod";
import {
  DISCORD_FLAG_IS_COMPONENTS_V2,
  buildFiledMessage,
  buildRefusalMessage,
  buildRequestModal,
  buildSessionPickerMessage,
  buildSubPreviewFlow,
  buildSubPreviewSessions,
  buildNoticeMessage,
  disableMessageControls,
  disabledControlsUpdate,
  discordSubLogoUrl,
  loadDiscordSubCopy,
  parseReasonValue,
  parseSessionValue,
  parseSubCustomId,
  pickedSessionOption,
  type DiscordComponent,
  type DiscordComponentsMessage,
  type DiscordSubCopy,
} from "@/lib/discord-substitution-message";
import type { GeduUpcomingSession } from "@/lib/gedu-upcoming-sessions";
import { addCalendarDays } from "@/lib/calendar-date";

/**
 * The `/sub` command's messages, as the data Discord is sent. Pinned: the
 * custom_id scheme both ways round, the session list's one capped select, the
 * caps Discord refuses a message for exceeding, and that the admin preview is
 * every message the command draws, from the same builders, with every control
 * on the preview prefix.
 */

const GROUP_A = "6f1c2c1e-6d43-4c1a-9a5e-2f8f0d1b7a10";
const GROUP_B = "0b7e2a56-3c1d-4f7e-8a2b-9c4d5e6f7a81";
const TZ = "Europe/Helsinki";
/** A Monday morning in Helsinki. */
const NOW = new Date("2026-10-05T06:00:00Z");
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
    ["sub:l", { kind: "list" }],
    ["sub:s:fi", { kind: "session", locale: "fi" }],
    [`sub:n:${GROUP_A}:2026-10-06`, { kind: "submit", groupId: GROUP_A, sessionDate: "2026-10-06" }],
    ["subpreview:s:en", { kind: "preview" }],
    ["subpreview:l", { kind: "preview" }],
  ])("reads %s", (customId, expected) => {
    expect(parseSubCustomId(customId)).toEqual(expected);
  });

  it.each([
    "other:l",
    "sub:l:0",
    "sub:s",
    "sub:s:de",
    "sub:s:fi:0",
    "sub:x",
    `sub:n:not-a-uuid:2026-10-06`,
    `sub:n:${GROUP_A}:06.10.2026`,
    `sub:n:${GROUP_A}:2026-10-06:sick`,
    `sub:r:${GROUP_A}:2026-10-06`,
    `sub:f:${GROUP_A}:2026-10-06:sick`,
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
  const sessions = [
    session(GROUP_A, "2026-10-06"),
    session(GROUP_B, "2026-10-08", { isRemote: true, siteName: null, groupName: null, productName: "Roblox Studio" }),
    session(GROUP_A, "2026-10-13"),
    session(GROUP_A, "2026-11-03"),
  ];

  /** `count` sessions a day apart from Oct 6, soonest first. */
  const daily = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      session(GROUP_A, addCalendarDays("2026-10-06", index)),
    );

  it("is one Components V2 container in the act colour", () => {
    const message = buildSessionPickerMessage({ copy: en, logoUrl: LOGO, sessions });

    expect(message.flags).toBe(DISCORD_FLAG_IS_COMPONENTS_V2);
    expect(message.components).toHaveLength(1);
    expect(message.components[0]).toMatchObject({ type: 17, accent_color: 0xfaa901 });
    expect(texts(message)).toContain("### Which session do you need a substitute for?");
    // Who sees a reason is said where the reason is asked for, not before.
    expect(texts(message).join("\n")).not.toContain("admins only");
  });

  it("lists every session in one select, soonest first, with no headings and no paging", () => {
    const message = buildSessionPickerMessage({ copy: en, logoUrl: LOGO, sessions });

    expect(selects(message)).toHaveLength(1);
    const [select] = selects(message);
    expect(select.custom_id).toBe("sub:s:en");
    expect(options(select).map((option) => option.value)).toEqual(
      sessions.map((entry) => entry.key),
    );
    expect(options(select).slice(0, 2)).toEqual([
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
    expect(buttons(message)).toHaveLength(0);
    expect(texts(message).some((line) => line.startsWith("**"))).toBe(false);
  });

  it("offers exactly 25 sessions when there are 25", () => {
    const message = buildSessionPickerMessage({ copy: en, logoUrl: LOGO, sessions: daily(25) });

    expect(options(selects(message)[0])).toHaveLength(25);
  });

  it("offers only the soonest 25 when there are more, and nothing to reach the rest", () => {
    const many = daily(40);
    const message = buildSessionPickerMessage({ copy: en, logoUrl: LOGO, sessions: many });

    expect(selects(message)).toHaveLength(1);
    expect(options(selects(message)[0]).map((option) => option.value)).toEqual(
      many.slice(0, 25).map((entry) => entry.key),
    );
    expect(buttons(message)).toHaveLength(0);
  });

  it("stays inside Discord's caps on every id and option", () => {
    const long = session(GROUP_A, "2026-10-06", {
      productName: "A product name long enough that the row would run past a hundred characters",
      groupName: "and a group name to push it further still",
    });
    const message = buildSessionPickerMessage({ copy: en, logoUrl: LOGO, sessions: [long] });

    for (const component of walk(message.components)) {
      if (typeof component.custom_id === "string") {
        expect(component.custom_id.length).toBeLessThanOrEqual(100);
      }
    }
    const [option] = options(selects(message)[0]);
    expect(option.description?.length).toBe(100);
    expect(option.description?.endsWith("…")).toBe(true);
  });

  it("says there is nothing to file for, and nothing more", () => {
    const message = buildSessionPickerMessage({ copy: en, logoUrl: LOGO, sessions: [] });

    expect(selects(message)).toHaveLength(0);
    expect(buttons(message)).toHaveLength(0);
    expect(texts(message)).toContain("You have no upcoming sessions to ask for a substitute for.");
  });

  it("speaks the copy's locale", () => {
    const message = buildSessionPickerMessage({ copy: fi, logoUrl: LOGO, sessions });

    expect(texts(message)).toContain("### Mille kerralle tarvitset tuuraajan?");
    expect(selects(message)[0].placeholder).toBe(fi.sub("pickPlaceholder"));
    // The modal the pick opens is answered unread, in the locale drawn here.
    expect(parseSubCustomId(String(selects(message)[0].custom_id))).toEqual({
      kind: "session",
      locale: "fi",
    });
  });
});

describe("the admin preview", () => {
  const flow = () =>
    buildSubPreviewFlow({
      copy: en,
      logoUrl: LOGO,
      now: NOW,
      origin: "https://sogverse.sog.gg",
    });

  it("is the same first step over sample sessions, every control on the preview prefix", () => {
    const sessions = buildSubPreviewSessions(NOW);
    const message = buildSessionPickerMessage({
      copy: en,
      logoUrl: LOGO,
      sessions,
      prefix: "subpreview",
    });

    expect(selects(message)).toHaveLength(1);
    expect(selects(message)[0].custom_id).toBe("subpreview:s:en");
    expect(parseSubCustomId("subpreview:s:en")).toEqual({ kind: "preview" });
    expect(options(selects(message)[0]).length).toBeGreaterThan(1);
  });

  it("draws every message the command can, in the order a gedu meets them", () => {
    const [notLinked, ...steps] = flow();

    expect(notLinked.content).not.toContain("https://");
    expect(notLinked.components).toEqual([
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: "Connect account",
            url: "https://sogverse.sog.gg/link-discord?token=preview",
          },
        ],
      },
    ]);
    expect(steps.map((step) => texts(step).join("\n"))).toEqual([
      expect.stringContaining("Which session do you need a substitute for?"),
      expect.stringContaining("✅"),
      expect.stringContaining("You’ve already asked for a substitute for this session."),
      expect.stringContaining("You have no upcoming sessions to ask for a substitute for."),
      expect.stringContaining(en.sub("failed")),
    ]);
    // The refusal keeps its way back to the list.
    expect(buttons(steps[2]).map((button) => button.custom_id)).toEqual(["subpreview:l"]);
  });

  it("puts every control of every step on the preview prefix", () => {
    const [, ...steps] = flow();
    const controls = steps.flatMap((step) => [...selects(step), ...buttons(step)]);

    // The session select and the refusal's way back.
    expect(controls).toHaveLength(2);
    for (const control of controls) {
      expect(parseSubCustomId(String(control.custom_id))).toEqual({ kind: "preview" });
    }
  });
});

describe("the request modal", () => {
  const picked = { label: "Tue, Oct 6, 16:00 – 17:30 GMT+3", description: "Minecraft Club — A · Kallio School" };
  const modalTexts = (components: DiscordComponent[]) =>
    components.filter((component) => component.type === 10).map((component) => String(component.content));
  const labels = (components: DiscordComponent[]) =>
    components.filter((component) => component.type === 18);

  it("names the session, says who sees a reason, and asks for the reason and the note", () => {
    const modal = buildRequestModal({ copy: en, groupId: GROUP_A, sessionDate: "2026-10-06", picked });

    expect(parseSubCustomId(modal.custom_id)).toEqual({
      kind: "submit",
      groupId: GROUP_A,
      sessionDate: "2026-10-06",
    });
    expect(modal.title).toBe("I can’t make this session");
    expect(modalTexts(modal.components)).toEqual([
      "**Tue, Oct 6, 16:00 – 17:30 GMT+3**\nMinecraft Club — A · Kallio School",
      en.form("substitutionRequestDialogBody"),
    ]);
    const [reason, note] = labels(modal.components);
    expect(reason).toMatchObject({
      label: en.form("substitutionReasonLabel"),
      component: { type: 3, custom_id: "reason", required: true },
    });
    // Nothing chosen to begin with, as on the web.
    expect(options(z.record(z.unknown()).parse(reason.component))).toEqual([
      { label: "Sick", value: "sick" },
      { label: "Something else", value: "other" },
    ]);
    expect(note).toMatchObject({
      label: "Note for the office",
      component: { type: 4, custom_id: "note", required: false, max_length: 500 },
    });
  });

  it("falls back to the session's date, in the copy's locale, when the picked option is not known", () => {
    const modal = buildRequestModal({ copy: en, groupId: GROUP_A, sessionDate: "2026-10-06", picked: null });
    expect(modalTexts(modal.components)[0]).toBe("**Tue, Oct 6**");

    // Never the raw ISO date, whatever the locale.
    const finnish = buildRequestModal({ copy: fi, groupId: GROUP_A, sessionDate: "2026-10-06", picked: null });
    expect(modalTexts(finnish.components)[0]).toBe("**ti 6.10.**");
  });

  it("fits every locale's modal inside Discord's caps", async () => {
    for (const locale of ["en", "fi", "sv", "fr", "tlh"] as const) {
      const modal = buildRequestModal({
        copy: await loadDiscordSubCopy(locale),
        groupId: GROUP_A,
        sessionDate: "2026-10-06",
        picked,
      });
      expect(modal.custom_id.length).toBeLessThanOrEqual(100);
      expect(modal.components.length).toBeLessThanOrEqual(5);
      expect(modal.title.length).toBeLessThanOrEqual(45);
      expect(modal.title.endsWith("…")).toBe(false);
      for (const label of labels(modal.components)) {
        expect(String(label.label).length).toBeLessThanOrEqual(45);
      }
    }
  });

  it("finds the picked option on the pressed message, leniently", () => {
    const pressed = buildSessionPickerMessage({
      copy: en,
      logoUrl: LOGO,
      sessions: [session(GROUP_A, "2026-10-06"), session(GROUP_B, "2026-10-08")],
    });

    expect(pickedSessionOption(pressed, `${GROUP_B}:2026-10-08`)).toEqual({
      label: "Thu, Oct 8, 16:00 – 17:30 GMT+3",
      description: "Minecraft Club — A · Kallio School",
    });
    expect(pickedSessionOption(pressed, `${GROUP_A}:2026-12-01`)).toBeNull();
    expect(pickedSessionOption({ components: "nope" }, `${GROUP_A}:2026-10-06`)).toBeNull();
    expect(pickedSessionOption(undefined, `${GROUP_A}:2026-10-06`)).toBeNull();
  });
});

describe("the outcome", () => {
  const picked = session(GROUP_A, "2026-10-06");

  it("confirms what was filed, and nothing more", () => {
    const message = buildFiledMessage({ copy: en, logoUrl: LOGO, session: picked });

    expect(texts(message)).toContain(
      "✅ Substitute requested for Minecraft Club — A on Tue, Oct 6, 16:00 – 17:30 GMT+3.",
    );
    expect(buttons(message)).toHaveLength(0);
  });

  it("names a session the list does not carry by its date, in the copy's locale", () => {
    const message = buildFiledMessage({
      copy: en,
      logoUrl: LOGO,
      session: { sessionDate: "2026-12-01" },
    });

    expect(texts(message)).toContain("**Tue, Dec 1**");
    expect(texts(message)).toContain(
      "✅ You’ve asked for a substitute for this session. Waiting for one.",
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
    expect(buttons(message).map((button) => button.custom_id)).toEqual(["sub:l"]);
  });
});

describe("the logo", () => {
  const picked = session(GROUP_A, "2026-10-06");
  const sessions = [picked, session(GROUP_A, "2026-10-20")];

  const steps: Array<[string, (logoUrl: string | null) => DiscordComponentsMessage]> = [
    ["the first step", (logoUrl) => buildSessionPickerMessage({ copy: en, logoUrl, sessions })],
    ["the empty list", (logoUrl) => buildSessionPickerMessage({ copy: en, logoUrl, sessions: [] })],
    [
      "the preview",
      (logoUrl) => buildSessionPickerMessage({ copy: en, logoUrl, sessions, prefix: "subpreview" }),
    ],
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
    expect(lines[0].content).toBe("# School of Gaming · Substitutions");
  });

  it.each(steps)("heads %s with plain lines when there is no logo", (_, build) => {
    const bare = build(null);
    const withLogo = build(LOGO);

    expect(ofType(bare, 9)).toHaveLength(0);
    expect(ofType(bare, 11)).toHaveLength(0);
    expect(containerChildren(bare)[0]).toEqual({
      type: 10,
      content: "# School of Gaming · Substitutions",
    });
    // The same lines and controls, only unwrapped.
    expect(texts(bare)).toEqual(texts(withLogo));
    expect([...selects(bare), ...buttons(bare)]).toEqual([...selects(withLogo), ...buttons(withLogo)]);
  });

  it("puts the step's heading beside the logo", () => {
    const message = buildSessionPickerMessage({ copy: en, logoUrl: LOGO, sessions });
    const [header] = containerChildren(message);

    expect(componentList.parse(header.components).map((line) => line.content)).toEqual([
      "# School of Gaming · Substitutions",
      "### Which session do you need a substitute for?",
    ]);
  });

  it("is the favicon on the origin it is given, and nothing without one", () => {
    expect(discordSubLogoUrl("https://sogverse-staging.sog.gg")).toBe(
      "https://sogverse-staging.sog.gg/apple-icon.png",
    );
    expect(discordSubLogoUrl(null)).toBeNull();
  });
});

describe("greying out a pressed message's controls", () => {
  const pressed = () => [
    {
      type: 17,
      accent_color: 1,
      components: [
        {
          type: 9,
          components: [{ type: 10, content: "# Header" }],
          accessory: { type: 11, media: { url: LOGO } },
        },
        {
          type: 9,
          components: [{ type: 10, content: "Row with a button" }],
          accessory: { type: 2, style: 2, custom_id: "sub:l", label: "More" },
        },
        { type: 1, components: [{ type: 3, custom_id: "sub:s", options: [] }] },
        {
          type: 1,
          components: [
            { type: 2, style: 1, custom_id: "sub:f:x", label: "File" },
            { type: 2, style: 5, url: "https://sogverse.sog.gg", label: "Web" },
          ],
        },
        { type: 1, components: [5, 6, 7, 8].map((type) => ({ type, custom_id: `s${type}` })) },
        { type: 99, components: [{ type: 2, style: 1, custom_id: "inside-unknown" }] },
      ],
    },
  ];

  const greyed = () => {
    const [container] = componentList.parse(disableMessageControls(pressed()));
    return componentList.parse(container.components);
  };

  it("disables every button and select, in containers, sections and rows", () => {
    const [header, section, selectRow, buttonRow, otherSelects] = greyed();

    expect(header.accessory).toEqual({ type: 11, media: { url: LOGO } });
    expect(section.accessory).toMatchObject({ custom_id: "sub:l", disabled: true });
    expect(selectRow.components).toEqual([
      { type: 3, custom_id: "sub:s", options: [], disabled: true },
    ]);
    expect(buttonRow.components).toEqual([
      { type: 2, style: 1, custom_id: "sub:f:x", label: "File", disabled: true },
      { type: 2, style: 5, url: "https://sogverse.sog.gg", label: "Web" },
    ]);
    expect(otherSelects.components).toEqual(
      [5, 6, 7, 8].map((type) => ({ type, custom_id: `s${type}`, disabled: true })),
    );
  });

  it("passes a component type it does not know through untouched", () => {
    expect(greyed()[5]).toEqual({
      type: 99,
      components: [{ type: 2, style: 1, custom_id: "inside-unknown" }],
    });
    expect(disableMessageControls(["text", null, 3])).toEqual(["text", null, 3]);
  });

  it("does not mutate the message it is given", () => {
    const input = pressed();
    const before = structuredClone(input);

    disableMessageControls(input);

    expect(input).toEqual(before);
  });

  it("restates the Components V2 flag alone, and no flag for a content message", () => {
    const components = [{ type: 1, components: [{ type: 2, style: 1, custom_id: "a" }] }];

    expect(
      disabledControlsUpdate({ flags: DISCORD_FLAG_IS_COMPONENTS_V2 | 64, components }),
    ).toEqual({
      flags: DISCORD_FLAG_IS_COMPONENTS_V2,
      components: [
        { type: 1, components: [{ type: 2, style: 1, custom_id: "a", disabled: true }] },
      ],
    });
    expect(disabledControlsUpdate({ flags: 64, components })).not.toHaveProperty("flags");
  });

  it("is nothing for a missing or unusable message", () => {
    expect(disabledControlsUpdate(undefined)).toBeNull();
    expect(disabledControlsUpdate(null)).toBeNull();
    expect(disabledControlsUpdate({ flags: DISCORD_FLAG_IS_COMPONENTS_V2 })).toBeNull();
    expect(disabledControlsUpdate({ components: "nope" })).toBeNull();
    expect(disabledControlsUpdate({ components: [] })).toBeNull();
  });
});
