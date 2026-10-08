import { describe, expect, it } from "vitest";
import {
  SLACK_ACCEPT_ACTION_ID,
  buildSlackLinkFirstReply,
  buildSlackLinkReply,
  buildSlackRefusalReply,
  buildSubstitutionSlackMessage,
  escapeSlack,
  type SlackBlock,
} from "@/lib/substitution-notifications/slack-message";
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
 * The staff channel's message, as the Block Kit Slack is sent: the facts an
 * admin answers an absence with, every gedu tagged with how the bot reached
 * them, Accept on each offer only while open, the closed states, Slack's caps
 * and the escaping its mrkdwn needs.
 */

function render(snapshot: SubstitutionNotificationSnapshot) {
  return buildSubstitutionSlackMessage({ snapshot, state: deriveNotificationState(snapshot) });
}

function allText(blocks: SlackBlock[]): string {
  return JSON.stringify(blocks);
}

function accessories(blocks: SlackBlock[]) {
  return blocks.flatMap((block) =>
    isRecord(block.accessory) ? [block.accessory] : [],
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  it("states who is absent, why, and the session's facts", () => {
    const { text, blocks } = render(
      notificationSnapshot({
        request: { reason: "other", reason_note: "Family matter" },
        required_qualifications: ["neuroinclusive"],
      }),
    );
    const body = allText(blocks);
    expect(blocks[0]).toMatchObject({ type: "header", text: { text: "Minecraft Club" } });
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

  it("open: one section per offer, oldest first, each with a confirmed Accept carrying its offer id", () => {
    const { blocks } = render(notificationSnapshot({ candidates: offers }));
    const accepts = accessories(blocks);
    expect(accepts.map((a) => a.value)).toEqual([SNAPSHOT_IDS.offerAino, SNAPSHOT_IDS.offerEero]);
    for (const accept of accepts) {
      expect(accept.action_id).toBe(SLACK_ACCEPT_ACTION_ID);
      expect(accept.confirm).toBeDefined();
    }
  });

  it("tags every gedu with how the bot reached them, and whether they are still eligible", () => {
    const { blocks } = render(
      notificationSnapshot({
        candidates: [
          ...offers,
          snapshotCandidate({ gedu_id: SNAPSHOT_IDS.lumi, first_name: "Lumi", response: "decline", eligible: false }),
          snapshotCandidate({ gedu_id: SNAPSHOT_IDS.requester, first_name: "Noora", discord_user_id: "333" }),
        ],
        dms: [
          snapshotDm({ gedu_id: SNAPSHOT_IDS.aino, message_id: "m1", channel_id: "c1" }),
          snapshotDm({ gedu_id: SNAPSHOT_IDS.eero, delivery_error: "DiscordApiError (50007)" }),
        ],
      }),
    );
    const body = allText(blocks);
    expect(body).toContain("Aino Korhonen _(DM'd)_");
    expect(body).toContain("Eero Mäki _(DM failed)_");
    expect(body).toContain("*Declined:* Lumi Example _(not on Discord, no longer eligible)_");
    expect(body).toContain("*No answer:* Noora Example _(not DM'd)_");
  });

  it("closed: no Accept, and a line saying how it closed", () => {
    const cases: [Parameters<typeof notificationSnapshot>[0], string][] = [
      [{ request: filledRequest() }, "*Filled* by Aino Korhonen (approved by Admin Person)"],
      [{ request: { status: "withdrawn" } }, "*Withdrawn*"],
      [{ is_cancelled: true }, "*Session cancelled*"],
      [{ product_today: "2026-10-20" }, "*Session passed*"],
    ];
    for (const [overrides, line] of cases) {
      const { blocks } = render(notificationSnapshot({ ...overrides, candidates: offers }));
      expect(accessories(blocks)).toEqual([]);
      expect(allText(blocks)).toContain(line);
    }
  });

  it("escapes & < > in what people typed", () => {
    const { blocks } = render(
      notificationSnapshot({
        request: { reason_note: "<!channel> & <b>", group_name: "A&B" },
        candidates: [snapshotCandidate({ gedu_id: SNAPSHOT_IDS.aino, first_name: "<@U1>" })],
      }),
    );
    const body = allText(blocks);
    expect(body).not.toContain("<!channel>");
    expect(body).toContain("&lt;!channel&gt; &amp; &lt;b&gt;");
    expect(body).toContain("A&amp;B");
    expect(body).toContain("&lt;@U1&gt;");
    expect(escapeSlack("a<b>&c")).toBe("a&lt;b&gt;&amp;c");
  });

  it("stays under Slack's caps with many gedus", () => {
    const many = Array.from({ length: 300 }, (_, index) =>
      snapshotCandidate({
        gedu_id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        first_name: `Gedu${index}`,
        last_name: "Withaveryveryverylongsurname",
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
    const body = allText(blocks);
    expect(body).toMatch(/\+\d+ more offers/);
    expect(body).toMatch(/\+\d+ more/);
  });
});

describe("the ephemeral replies", () => {
  const url = "https://sogverse.sog.gg/link-slack?token=abc";

  it("the link replies carry the URL on a button, to the presser alone, replacing nothing", () => {
    for (const reply of [buildSlackLinkReply(url), buildSlackLinkFirstReply(url)]) {
      expect(reply).toMatchObject({ response_type: "ephemeral", replace_original: false });
      expect(JSON.stringify(reply.blocks)).toContain(`"url":"${url}"`);
      expect(reply.text).not.toContain(url);
    }
    expect(buildSlackLinkFirstReply(url).text).toContain("Nothing was accepted");
  });

  it("the refusal reply carries its line, escaped", () => {
    const reply = buildSlackRefusalReply("Already <filled>");
    expect(reply.response_type).toBe("ephemeral");
    expect(JSON.stringify(reply.blocks)).toContain("Already &lt;filled&gt;");
  });
});
