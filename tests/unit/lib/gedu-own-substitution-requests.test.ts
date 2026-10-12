import { describe, expect, it } from "vitest";
import { buildOwnSubstitutionRequestRows } from "@/lib/gedu-own-substitution-requests";
import type { LiveSubstitutionRequest } from "@/services/session-substitution";

/**
 * The Substitutions page's "Your requests": the gedu's live requests turned into
 * the cards that carry the session card's own status panel.
 */

const GEDU = "3f0b6a2e-58c1-4d7e-9b1a-2c4e6f8a0b1d";
const SUB = "8d2c4e6f-0a1b-4c3d-9e5f-7a9b1c3d5e7f";

/** Mondays, 16:00 for 90 minutes, Helsinki — 2026-10-12 is a Monday. */
function request(
  fields: Partial<LiveSubstitutionRequest> & Pick<LiveSubstitutionRequest, "id">,
): LiveSubstitutionRequest {
  return {
    group_id: "5b7d9f1a-3c5e-4a7b-8c9d-0e1f2a3b4c5d",
    group_name: "Ryhmä A",
    session_date: "2026-10-12",
    role: "primary",
    status: "open",
    created_at: "2026-10-01T09:00:00+00:00",
    requested_by: GEDU,
    requested_by_first_name: "Sanna",
    substitute_id: null,
    substitute_first_name: null,
    approved_at: null,
    is_requester: true,
    offer_count: 0,
    reason: null,
    reason_note: null,
    session_cancelled: false,
    product: {
      id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
      product_type: "consumer_club",
      tag: null,
      topic: "minecraft_java",
      spoken_language_code: "fi",
      timezone: "Europe/Helsinki",
      is_remote: true,
      start_date: "2026-09-01",
      end_date: null,
      site_name: null,
      translations: [
        { locale: "en", name: "Minecraft Java Club", description: "" },
      ],
      schedule_slots: [
        { weekday: 0, start_time: "16:00:00", duration_minutes: 90 },
      ],
    },
    ...fields,
  };
}

describe("buildOwnSubstitutionRequestRows", () => {
  it("orders the requests soonest session first, whatever order they arrive in", () => {
    const rows = buildOwnSubstitutionRequestRows(
      [
        request({ id: "later", session_date: "2026-10-26" }),
        request({ id: "sooner", session_date: "2026-10-12" }),
      ],
      "en",
    );

    expect(rows.map((row) => row.requestId)).toEqual(["sooner", "later"]);
    expect(rows[0].session.productName).toBe("Minecraft Java Club");
    expect(rows[0].session.startsAt?.toISOString()).toBe(
      "2026-10-12T13:00:00.000Z",
    );
    expect(rows[0].groupName).toBe("Ryhmä A");
  });

  it("hands the panel the state a session card hands it", () => {
    const [open, substituted] = buildOwnSubstitutionRequestRows(
      [
        request({ id: "open", offer_count: 2 }),
        request({
          id: "substituted",
          session_date: "2026-10-19",
          status: "substituted",
          substitute_id: SUB,
          substitute_first_name: "Saana",
          approved_at: "2026-10-02T12:00:00+00:00",
        }),
      ],
      "en",
    );

    expect(open.request).toMatchObject({
      id: "open",
      status: "open",
      substituteId: null,
      offerCount: 2,
      isViewers: true,
    });
    expect(substituted.request).toMatchObject({
      id: "substituted",
      status: "substituted",
      substituteId: { id: SUB, firstName: "Saana" },
    });
  });

  it("leaves out a request on a cancelled session", () => {
    const rows = buildOwnSubstitutionRequestRows(
      [
        request({ id: "kept" }),
        request({
          id: "cancelled",
          session_date: "2026-10-19",
          session_cancelled: true,
        }),
      ],
      "en",
    );

    expect(rows.map((row) => row.requestId)).toEqual(["kept"]);
  });
});
