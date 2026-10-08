import { describe, expect, it } from "vitest";
import {
  SLACK_ACCEPT_ACTION_ID,
  buildSlackLinkFirstReply,
  buildSlackLinkReply,
  buildSlackPreviewPressReply,
  buildSlackRefusalReply,
  buildSubstitutionSlackMessage,
  escapeSlack,
  type SlackBlock,
} from "@/lib/substitution-notifications/slack-message";
import { buildSubstitutionSlackPreviewSet } from "@/lib/substitution-notifications/slack-preview";
import { deriveNotificationState } from "@/lib/substitution-notifications/state";
import type { SubstitutionNotificationSnapshot } from "@/lib/substitution-notifications/snapshot.contracts";
import {
  SNAPSHOT_IDS,
  filledRequest,
  notificationSnapshot,
  snapshotCandidate,
  snapshotDm,
} from "../../../mocks/substitution-notifications";

/**
 * The staff channel's message, as the Block Kit Slack is sent: where the
 * request stands first, the facts an admin answers an absence with, the
 * offers as cards with Accept only while open, every gedu in a table with how
 * the bot reached them, the closed states, Slack's caps and the escaping its
 * mrkdwn needs — and the admin tool's preview set built from it.
 */

function render(snapshot: SubstitutionNotificationSnapshot) {
  return buildSubstitutionSlackMessage({ snapshot, state: deriveNotificationState(snapshot) });
}

function allText(blocks: SlackBlock[]): string {
  return JSON.stringify(blocks);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function cards(blocks: SlackBlock[]): Record<string, unknown>[] {
  return blocks.filter((block) => block.type === "carousel").flatMap((block) => records(block.elements));
}

function buttons(blocks: SlackBlock[]): Record<string, unknown>[] {
  return cards(blocks).flatMap((card) => records(card.actions));
}

function cardTitle(card: Record<string, unknown>): unknown {
  return isRecord(card.title) ? card.title.text : undefined;
}

/** The data table's rows as plain strings, header first. */
function tableRows(blocks: SlackBlock[]): string[][] {
  const table = blocks.find((block) => block.type === "data_table");
  if (!table || !Array.isArray(table.rows)) return [];
  return table.rows.map((row: unknown) =>
    records(row).map((cell) => (typeof cell.text === "string" ? cell.text : "")),
  );
}

const offers = [
  snapshotCandidate({
    gedu_id: SNAPSHOT_IDS.eero,
    first_name: "Eero",
    last_name: "Mäki",
    discord_user_id: "222",
    response: "offer",
    offer_id: SNAPSHOT_IDS.offerEero,
    responded_at: "2026-10-08T10:00:00.000Z",
  }),
  snapshotCandidate({
    gedu_id: SNAPSHOT_IDS.aino,
    first_name: "Aino",
    last_name: "Korhonen",
    discord_user_id: "111",
    response: "offer",
    offer_id: SNAPSHOT_IDS.offerAino,
    responded_at: "2026-10-08T09:00:00.000Z",
  }),
];

describe("buildSubstitutionSlackMessage", () => {
  it("leads with where the request stands, then states who is absent, why, and the session's facts", () => {
    const { text, blocks } = render(
      notificationSnapshot({
        request: { reason: "other", reason_note: "Family matter" },
        required_qualifications: ["neuroinclusive"],
      }),
    );
    const body = allText(blocks);
    expect(blocks[0]).toMatchObject({ type: "section", text: { text: expect.stringContaining("Needs a substitute") } });
    expect(blocks[1]).toMatchObject({ type: "header", text: { text: "Minecraft Club" } });
    expect(body).toContain("Ville Virtanen");
    expect(body).toContain("Other");
    expect(body).toContain("Family matter");
    expect(body).toContain("Kallio School");
    expect(body).toContain("Finnish");
    expect(body).toContain("Neuroinclusive");
    expect(body).toContain("€45.00 per session");
    expect(body).toMatch(/Wed, Oct 14, 16:00.*17:30/);
    expect(text).toMatch(/^Substitute needed: Minecraft Club – A, Wed, Oct 14/);
  });

  it("never sends an alert block, which Slack refuses in a message", () => {
    const { blocks } = render(notificationSnapshot({ candidates: offers }));
    expect(blocks.map((block) => block.type)).not.toContain("alert");
  });

  it("open: one card per offer in a carousel, oldest first, each with a confirmed Accept carrying its offer id", () => {
    const { blocks } = render(notificationSnapshot({ candidates: offers }));
    expect(cards(blocks).map(cardTitle)).toEqual(["Aino Korhonen", "Eero Mäki"]);
    const accepts = buttons(blocks);
    expect(accepts.map((a) => a.value)).toEqual([SNAPSHOT_IDS.offerAino, SNAPSHOT_IDS.offerEero]);
    for (const accept of accepts) {
      expect(accept).toMatchObject({ type: "button", action_id: SLACK_ACCEPT_ACTION_ID, style: "primary" });
      expect(accept.confirm).toBeDefined();
    }
    expect(allText(cards(blocks))).toContain("Offered Oct 8, 12:00");
  });

  it("says so where nobody has offered yet", () => {
    const { blocks } = render(notificationSnapshot({ candidates: [snapshotCandidate({ gedu_id: SNAPSHOT_IDS.aino })] }));
    expect(cards(blocks)).toEqual([]);
    expect(allText(blocks)).toContain("No offers yet");
  });

  it("lists every gedu in the table: offers, declines, then the rest, with how the bot reached them", () => {
    const { blocks } = render(
      notificationSnapshot({
        candidates: [
          snapshotCandidate({ gedu_id: SNAPSHOT_IDS.requester, first_name: "Noora", discord_user_id: "333" }),
          snapshotCandidate({ gedu_id: SNAPSHOT_IDS.lumi, first_name: "Lumi", response: "decline", eligible: false }),
          ...offers,
        ],
        dms: [
          snapshotDm({ gedu_id: SNAPSHOT_IDS.aino, message_id: "m1", channel_id: "c1" }),
          snapshotDm({ gedu_id: SNAPSHOT_IDS.eero, delivery_error: "DiscordApiError (50007)" }),
        ],
      }),
    );
    expect(tableRows(blocks)).toEqual([
      ["Gedu", "Discord", "Answer"],
      ["Aino Korhonen", "DM'd", "Offered"],
      ["Eero Mäki", "DM failed", "Offered"],
      ["Lumi Example", "not on Discord", "Declined"],
      ["Noora Example", "not DM'd", "—"],
    ]);
  });

  it("tags no one as no longer eligible: a card holds only its title, subtitle and actions", () => {
    const { blocks } = render(notificationSnapshot({ candidates: [{ ...offers[0], eligible: false }] }));
    expect(JSON.stringify(blocks)).not.toMatch(/eligib/i);
    expect(cards(blocks)[0]).not.toHaveProperty("body");
  });

  it("closed: the cards stay, every button goes, and the first line says how it closed", () => {
    const cases: [Parameters<typeof notificationSnapshot>[0], string][] = [
      [{ request: filledRequest() }, "*Filled by Aino Korhonen*, approved by Admin Person"],
      [{ request: { status: "withdrawn" } }, "*Withdrawn*"],
      [{ is_cancelled: true }, "*Session cancelled*"],
      [{ product_today: "2026-10-20" }, "*Session passed*"],
    ];
    for (const [overrides, line] of cases) {
      const { blocks } = render(notificationSnapshot({ ...overrides, candidates: offers }));
      expect(cards(blocks)).toHaveLength(2);
      expect(buttons(blocks)).toEqual([]);
      expect(allText(blocks)).not.toContain('"actions"');
      expect(allText([blocks[0]])).toContain(line);
    }
  });

  it("escapes & < > in what people typed wherever it is mrkdwn", () => {
    const { blocks } = render(
      notificationSnapshot({
        request: { reason_note: "<!channel> & <b>", group_name: "A&B" },
        candidates: [snapshotCandidate({ gedu_id: SNAPSHOT_IDS.aino, first_name: "<@U1>" })],
      }),
    );
    const mrkdwnText = blocks
      .filter((block) => block.type === "section")
      .map((block) => JSON.stringify(block))
      .join("");
    expect(mrkdwnText).not.toContain("<!channel>");
    expect(mrkdwnText).toContain("&lt;!channel&gt; &amp; &lt;b&gt;");
    expect(mrkdwnText).toContain("A&amp;B");
    // The table's cells are raw text, which Slack never parses for mentions.
    expect(tableRows(blocks)[1][0]).toBe("<@U1> Example");
    expect(escapeSlack("a<b>&c")).toBe("a&lt;b&gt;&amp;c");
  });

  it("escapes what people typed in the fallback text too", () => {
    const { text } = render(
      notificationSnapshot({
        request: {
          ...filledRequest(),
          group_name: "<!channel> & co",
          substitute: { id: SNAPSHOT_IDS.aino, first_name: "<!here>", last_name: "<b>" },
        },
      }),
    );
    expect(text).not.toContain("<!channel>");
    expect(text).not.toContain("<!here>");
    expect(text).toContain("&lt;!channel&gt; &amp; co");
    expect(text).toContain("&lt;!here&gt; &lt;b&gt;");
  });

  it("stays under Slack's caps with many gedus and long names", () => {
    const many = Array.from({ length: 300 }, (_, index) =>
      snapshotCandidate({
        gedu_id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        first_name: `Gedu${index}`,
        last_name: "Withaveryveryverylongsurname".repeat(index === 0 ? 10 : 1),
        response: index % 3 === 0 ? "offer" : index % 3 === 1 ? "decline" : null,
        offer_id: index % 3 === 0 ? `00000000-0000-4000-9000-${String(index).padStart(12, "0")}` : null,
        responded_at: "2026-10-08T09:00:00.000Z",
      }),
    );
    const { blocks } = render(notificationSnapshot({ candidates: many, request: { reason_note: "x".repeat(500) } }));
    expect(blocks.length).toBeLessThan(50);
    for (const block of blocks) {
      const text = isRecord(block.text) && typeof block.text.text === "string" ? block.text.text : "";
      expect(text.length).toBeLessThanOrEqual(3000);
    }

    const shown = cards(blocks);
    expect(shown).toHaveLength(10);
    for (const card of shown) {
      for (const [field, max] of [["title", 150], ["subtitle", 150], ["body", 200]] as const) {
        const value = card[field];
        if (isRecord(value)) expect(String(value.text).length).toBeLessThanOrEqual(max);
      }
    }
    expect(allText(blocks)).toContain("+90 more offers");

    const rows = tableRows(blocks);
    expect(rows.length).toBeLessThanOrEqual(201);
    expect(rows.flat().join("").length).toBeLessThanOrEqual(20_000);
    expect(new Set(rows.map((row) => row.length))).toEqual(new Set([3]));
    expect(allText(blocks)).toMatch(/\+\d+ more gedus/);
  });

  it("puts the controls on the preview prefix for the admin tool", () => {
    const { blocks } = buildSubstitutionSlackMessage({
      snapshot: notificationSnapshot({ candidates: offers }),
      state: { kind: "open" },
      preview: true,
    });
    expect(buttons(blocks).map((button) => button.action_id)).toEqual([
      "subpreview_accept",
      "subpreview_accept",
    ]);
  });
});

describe("the ephemeral replies", () => {
  const url = "https://sogverse.sog.gg/link-slack?token=abc";

  it("the link replies carry the URL on a button, to the presser alone, replacing nothing", () => {
    for (const reply of [buildSlackLinkReply(url), buildSlackLinkFirstReply(url)]) {
      expect(reply).toMatchObject({ response_type: "ephemeral", replace_original: false });
      expect(JSON.stringify(reply.blocks)).toContain(`"url":"${url}"`);
      expect(JSON.stringify(reply.blocks)).not.toContain("action_id");
      expect(reply.text).not.toContain(url);
    }
    expect(buildSlackLinkFirstReply(url).text).toContain("Nothing was accepted");
  });

  it("the refusal reply carries its line, escaped", () => {
    const reply = buildSlackRefusalReply("Already <filled>");
    expect(reply.response_type).toBe("ephemeral");
    expect(JSON.stringify(reply.blocks)).toContain("Already &lt;filled&gt;");
  });

  it("the preview press reply says nothing was approved", () => {
    expect(buildSlackPreviewPressReply()).toMatchObject({
      response_type: "ephemeral",
      text: "This is a preview — nothing was approved.",
    });
  });
});

describe("buildSubstitutionSlackPreviewSet", () => {
  const set = buildSubstitutionSlackPreviewSet({
    now: new Date("2026-10-08T12:00:00.000Z"),
    origin: "https://sogverse.sog.gg",
  });

  it("draws every state in the order an admin meets them, then the three replies, labelled", () => {
    const firstLines = set.map((message) => allText([message.blocks[0]]));
    expect(firstLines[0]).toContain("Needs a substitute");
    expect(firstLines[1]).toContain("Needs a substitute");
    expect(firstLines[2]).toContain("Filled by Aino Korhonen");
    expect(firstLines[3]).toContain("Withdrawn");
    expect(firstLines[4]).toContain("Session cancelled");
    expect(firstLines[5]).toContain("Session passed");
    for (const reply of set.slice(6)) {
      expect(reply.blocks[0]).toMatchObject({ type: "context" });
      expect(reply.text).toMatch(/^\[Preview of an ephemeral reply/);
    }
    expect(set).toHaveLength(9);
  });

  it("opens with nobody answered, then two offers, a decline and a gedu in every Discord status", () => {
    expect(cards(set[0].blocks)).toEqual([]);
    expect(tableRows(set[0].blocks).slice(1).map((row) => row[2])).toEqual(["—", "—", "—"]);

    const rows = tableRows(set[1].blocks).slice(1);
    expect(rows.map((row) => row[2])).toEqual(["Offered", "Offered", "Declined", "—", "—"]);
    expect(new Set(rows.map((row) => row[1]))).toEqual(
      new Set(["DM'd", "DM failed", "not on Discord", "not DM'd"]),
    );
    expect(rows.every((row) => row.length === 3)).toBe(true);
  });

  it("puts every control on the preview prefix, and the link on a token no row holds", () => {
    const actionIds = JSON.stringify(set).match(/"action_id":"[^"]+"/g) ?? [];
    expect(actionIds.length).toBeGreaterThan(0);
    for (const id of actionIds) expect(id).toMatch(/"action_id":"subpreview/);
    expect(JSON.stringify(set)).toContain("https://sogverse.sog.gg/link-slack?token=preview");
    expect(JSON.stringify(set)).not.toContain(SLACK_ACCEPT_ACTION_ID);
  });
});
