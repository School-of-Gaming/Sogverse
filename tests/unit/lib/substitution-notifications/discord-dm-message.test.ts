import { beforeAll, describe, expect, it } from "vitest";
import {
  DISCORD_FLAG_IS_COMPONENTS_V2,
  parseSubCustomId,
  type DiscordComponentsMessage,
} from "@/lib/discord-substitution-message";
import {
  buildSubstitutionAcceptedDm,
  buildSubstitutionOfferDm,
  buildSubstitutionPreviewFlow,
  loadDiscordSubOfferCopy,
  parseSubReqCustomId,
  substitutionDmSession,
  type DiscordSubOfferCopy,
} from "@/lib/substitution-notifications/discord-dm-message";
import type { NotificationStateKind } from "@/lib/substitution-notifications/state";
import fi from "../../../../messages/fi.json";
import {
  SNAPSHOT_IDS,
  notificationSnapshot,
} from "../../../mocks/substitution-notifications";

/**
 * The substitution DMs, as the data Discord is sent: the controls following the
 * gedu's answer and the request's state, the custom_id scheme both ways round,
 * the pool's facts without the absent gedu, the recipient's locale, and the
 * admin preview on the preview prefix.
 */

const LOGO = "https://sogverse.sog.gg/apple-icon.png";
const REQUEST = SNAPSHOT_IDS.request;

let en: DiscordSubOfferCopy;
let finnish: DiscordSubOfferCopy;

beforeAll(async () => {
  en = await loadDiscordSubOfferCopy("en");
  finnish = await loadDiscordSubOfferCopy("fi");
});

function walk(node: unknown, into: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, into);
    return into;
  }
  if (!isRecord(node)) return into;
  into.push(node);
  walk(node.components, into);
  walk(node.accessory, into);
  return into;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buttons(message: DiscordComponentsMessage) {
  return walk(message.components).filter((c) => c.type === 2);
}

function texts(message: DiscordComponentsMessage): string {
  return walk(message.components)
    .filter((c) => c.type === 10)
    .map((c) => String(c.content))
    .join("\n");
}

function offerDm(
  response: "offer" | "decline" | null,
  state: NotificationStateKind,
  refusalLine: string | null = null,
  copy = en,
) {
  return buildSubstitutionOfferDm({
    copy,
    logoUrl: LOGO,
    session: substitutionDmSession(notificationSnapshot(), copy.locale),
    response,
    state,
    refusalLine,
  });
}

describe("parseSubReqCustomId", () => {
  it("reads an offer and a decline", () => {
    expect(parseSubReqCustomId(`subreq:o:${REQUEST}`)).toEqual({ kind: "offer", requestId: REQUEST });
    expect(parseSubReqCustomId(`subreq:d:${REQUEST}`)).toEqual({ kind: "decline", requestId: REQUEST });
  });

  it("refuses anything else", () => {
    for (const id of [
      `subreq:x:${REQUEST}`,
      "subreq:o:not-a-uuid",
      `subreq:o:${REQUEST}:extra`,
      `sub:o:${REQUEST}`,
      `subpreview:o:${REQUEST}`,
      "subreq:o",
    ]) {
      expect(parseSubReqCustomId(id)).toBeNull();
    }
  });
});

describe("buildSubstitutionOfferDm", () => {
  it("is a Components V2 message with the logo", () => {
    const message = offerDm(null, "open");
    expect(message.flags).toBe(DISCORD_FLAG_IS_COMPONENTS_V2);
    expect(JSON.stringify(message)).toContain(LOGO);
  });

  it("unanswered and open: Decline then Offer, the affirmative last", () => {
    const shown = buttons(offerDm(null, "open"));
    expect(shown.map((b) => b.custom_id)).toEqual([`subreq:d:${REQUEST}`, `subreq:o:${REQUEST}`]);
    expect(shown.map((b) => b.label)).toEqual(["Decline", "Offer to substitute"]);
    expect(shown.map((b) => b.style)).toEqual([2, 1]);
    for (const id of shown.map((b) => String(b.custom_id))) {
      expect(parseSubReqCustomId(id)?.requestId).toBe(REQUEST);
    }
  });

  it("offered: the receipt line and only Decline", () => {
    const message = offerDm("offer", "open");
    expect(texts(message)).toContain("You offered to substitute");
    expect(buttons(message).map((b) => b.custom_id)).toEqual([`subreq:d:${REQUEST}`]);
  });

  it("declined: the quiet line and only Offer", () => {
    const message = offerDm("decline", "open");
    expect(texts(message)).toContain("You declined");
    expect(buttons(message).map((b) => b.custom_id)).toEqual([`subreq:o:${REQUEST}`]);
  });

  it("a refused press: the refusal line, and the buttons back", () => {
    const message = offerDm("offer", "open", "This session has already passed.");
    expect(texts(message)).toContain("⚠️ This session has already passed.");
    expect(buttons(message)).toHaveLength(1);
  });

  it("closed: no buttons, and why", () => {
    expect(buttons(offerDm("offer", "filled"))).toEqual([]);
    expect(texts(offerDm("offer", "filled"))).toContain("This session has been filled");
    for (const state of ["withdrawn", "cancelled", "past"] as const) {
      const message = offerDm(null, state);
      expect(buttons(message)).toEqual([]);
      expect(texts(message)).toContain("A substitute is no longer needed");
    }
  });

  it("states the pool's facts: when in the product zone, what, where, topic, language, role and fee", () => {
    const body = texts(offerDm(null, "open"));
    expect(body).toContain("Wed, Oct 14");
    // The product's own clock and zone name — the reader's zone never reaches the bot.
    expect(body).toMatch(/16:00.*17:30.*(EEST|GMT\+3)/);
    expect(body).toContain("Minecraft Club — A");
    expect(body).toContain("Kallio School");
    expect(body).toContain("Minecraft");
    expect(body).toContain("Finnish");
    expect(body).toContain("Primary");
    expect(body).toContain("€45.00 per session");
  });

  it("never names the absent gedu or the reason", () => {
    const snapshot = notificationSnapshot({ request: { reason_note: "Flu, sorry" } });
    const json = JSON.stringify(
      buildSubstitutionOfferDm({
        copy: en,
        logoUrl: null,
        session: substitutionDmSession(snapshot, "en"),
        response: null,
        state: "open",
      }),
    );
    expect(json).not.toContain("Ville");
    expect(json).not.toContain("Flu");
  });

  it("speaks the recipient's locale", () => {
    const body = JSON.stringify(offerDm(null, "open", null, finnish));
    expect(body).toContain(fi.discordSubOffer.heading);
    expect(body).toContain(fi.gedu.substitution.poolOfferAction);
    expect(body).toContain(fi.gedu.substitution.poolDeclineAction);
    expect(body).toContain("Minecraft-klubi");
  });

  it("leaves out a fee the product has not set", () => {
    const snapshot = notificationSnapshot({ request: { fee_cents: null } });
    const message = buildSubstitutionOfferDm({
      copy: en,
      logoUrl: null,
      session: substitutionDmSession(snapshot, "en"),
      response: null,
      state: "open",
    });
    expect(texts(message)).not.toContain("per session");
  });
});

describe("buildSubstitutionAcceptedDm", () => {
  const session = () => substitutionDmSession(notificationSnapshot(), "en");

  it("says the session is theirs, with a link to My SOG", () => {
    const message = buildSubstitutionAcceptedDm({
      copy: en,
      logoUrl: LOGO,
      session: session(),
      mySogUrl: "https://sogverse.sog.gg/gedu",
    });
    expect(texts(message)).toContain("You’ve been accepted");
    expect(texts(message)).toContain("Minecraft Club – A on Wed, Oct 14");
    expect(buttons(message)).toEqual([
      expect.objectContaining({ style: 5, url: "https://sogverse.sog.gg/gedu", label: "Open My SOG" }),
    ]);
  });

  it("goes without the button when there is no URL Discord could open", () => {
    const message = buildSubstitutionAcceptedDm({ copy: en, logoUrl: null, session: session(), mySogUrl: null });
    expect(buttons(message)).toEqual([]);
  });
});

describe("buildSubstitutionPreviewFlow", () => {
  it("draws every DM, every control on the preview prefix", () => {
    const flow = buildSubstitutionPreviewFlow({
      copy: en,
      logoUrl: LOGO,
      now: new Date("2026-10-08T06:00:00Z"),
      mySogUrl: "https://sogverse.sog.gg/gedu",
      refusalLine: "This session has already passed.",
    });
    expect(flow).toHaveLength(7);
    const pressable = flow.flatMap(buttons).filter((b) => b.style !== 5);
    expect(pressable.length).toBeGreaterThan(0);
    for (const control of pressable) {
      const id = String(control.custom_id);
      expect(id.startsWith("subpreview:")).toBe(true);
      expect(parseSubCustomId(id)).toEqual({ kind: "preview" });
      expect(parseSubReqCustomId(id)).toBeNull();
    }
  });

  it("the sample session is a real one a week ahead, with a time", () => {
    const [first] = buildSubstitutionPreviewFlow({
      copy: en,
      logoUrl: null,
      now: new Date("2026-10-08T06:00:00Z"),
      mySogUrl: null,
      refusalLine: "x",
    });
    expect(texts(first)).toContain("Thu, Oct 15");
    expect(texts(first)).toContain("16:00");
  });
});
