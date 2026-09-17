import { describe, it, expect } from "vitest";

import {
  creationKey,
  readCreations,
  readPlaces,
  readProductNames,
  readRecordedSessionsByGroup,
  readRobloxAccounts,
  readSeatConsents,
  type ConsentSeat,
} from "@/services/partner/partner-shared-lookups.server";
import { createFetchStubbedClient, requestedUrl } from "../../../mocks/postgrest-fetch";
import { postgrestTables } from "../../../mocks/partner-api";

const P1 = "10000000-0000-4000-8000-000000000001";
const P2 = "10000000-0000-4000-8000-000000000002";
const GAMER = "20000000-0000-4000-8000-000000000001";
const GAMER_2 = "20000000-0000-4000-8000-000000000002";
const PARENT = "30000000-0000-4000-8000-000000000001";
const G1 = "50000000-0000-4000-8000-000000000001";
const G2 = "50000000-0000-4000-8000-000000000002";
const S1 = "60000000-0000-4000-8000-000000000001";
const S2 = "60000000-0000-4000-8000-000000000002";
const S3 = "60000000-0000-4000-8000-000000000003";

// ---------------------------------------------------------------------------

describe("readSeatConsents", () => {
  const NOW = new Date("2026-09-17T12:00:00Z");

  const versions = [
    { document_slug: "roblox-privacy-policy", version: "2026-05-01" },
    { document_slug: "roblox-programme-terms", version: "2026-05-01" },
    { document_slug: "roblox-programme-terms", version: "2026-08-15" },
  ];

  const seat: ConsentSeat = {
    id: "40000000-0000-4000-8000-000000000001",
    customer_id: PARENT,
    participant_id: GAMER,
    product_id: P1,
    signed_up_at: "2026-09-01T10:00:00+00:00",
  };

  function acceptance(overrides: Record<string, unknown>) {
    return {
      id: "70000000-0000-4000-8000-000000000001",
      customer_id: PARENT,
      participant_id: GAMER,
      product_id: P1,
      document_slug: "roblox-programme-terms",
      document_version: "2026-08-15",
      accepted_at: "2026-09-01T09:59:00+00:00",
      ...overrides,
    };
  }

  it("reports the latest acceptance on file for the seat's own customer, child and product", async () => {
    const fetch = postgrestTables({
      consent_document_versions: () => versions,
      // In accepted order, as the read asks for them.
      consent_acceptances: () => [
        acceptance({ document_version: "2026-05-01", accepted_at: "2026-06-01T08:00:00+00:00" }),
        acceptance({ id: "70000000-0000-4000-8000-000000000002" }),
        // Another product's acceptance by the same child is not this seat's.
        acceptance({ product_id: P2, document_version: "2026-05-01", accepted_at: "2026-09-10T08:00:00+00:00" }),
        acceptance({
          document_slug: "roblox-privacy-policy",
          document_version: "2026-05-01",
          accepted_at: "2026-09-01T09:59:30+00:00",
        }),
      ],
    });
    const consents = await readSeatConsents(createFetchStubbedClient(fetch), [seat], NOW);

    expect(consents.get(seat.id)).toEqual({
      terms: { version: "2026-08-15", accepted_at: "2026-09-01T09:59:00.000Z" },
      privacy_policy: { version: "2026-05-01", accepted_at: "2026-09-01T09:59:30.000Z" },
    });
    const url = requestedUrl(fetch.mock.calls[1][0]);
    expect(url.searchParams.get("accepted_at")).toBe(`lte.${NOW.toISOString()}`);
  });

  it("treats a seat with nothing on file as consented at sign-up, on the version then current (D1)", async () => {
    const fetch = postgrestTables({
      consent_document_versions: () => versions,
      consent_acceptances: () => [],
    });
    const consents = await readSeatConsents(createFetchStubbedClient(fetch), [seat], NOW);

    expect(consents.get(seat.id)).toEqual({
      // 2026-08-15 is the latest version on or before the 1 September sign-up.
      terms: { version: "2026-08-15", accepted_at: "2026-09-01T10:00:00.000Z" },
      privacy_policy: { version: "2026-05-01", accepted_at: "2026-09-01T10:00:00.000Z" },
    });
  });

  it("falls back to the earliest version for a seat older than every version", async () => {
    const fetch = postgrestTables({
      consent_document_versions: () => versions,
      consent_acceptances: () => [],
    });
    const early = { ...seat, signed_up_at: "2026-01-10T10:00:00+00:00" };
    const consents = await readSeatConsents(createFetchStubbedClient(fetch), [early], NOW);
    expect(consents.get(seat.id)?.terms.version).toBe("2026-05-01");
  });

  it("fails loudly on a version that is not a date (D4)", async () => {
    const fetch = postgrestTables({
      consent_document_versions: () => [...versions, { document_slug: "roblox-privacy-policy", version: "v2" }],
      consent_acceptances: () => [],
    });
    await expect(
      readSeatConsents(createFetchStubbedClient(fetch), [seat], NOW),
    ).rejects.toThrow(/not a YYYY-MM-DD date/);
  });

  it("fails loudly on a document with no published version", async () => {
    const fetch = postgrestTables({
      consent_document_versions: () => versions.slice(1),
      consent_acceptances: () => [],
    });
    await expect(
      readSeatConsents(createFetchStubbedClient(fetch), [seat], NOW),
    ).rejects.toThrow(/roblox-privacy-policy has no published version/);
  });

  it("reads nothing for no seats", async () => {
    const fetch = postgrestTables({});
    expect(await readSeatConsents(createFetchStubbedClient(fetch), [], NOW)).toEqual(new Map());
    expect(fetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

describe("readCreations", () => {
  it("returns each asked-for pair's list with its Roblox flag, and nothing else", async () => {
    const fetch = postgrestTables({
      gamer_group_creations: () => [
        {
          group_id: G1,
          participant_id: GAMER,
          creations: [
            { title: "Obby", url: "https://www.roblox.com/games/1/Obby" },
            { title: "Notes", url: "https://example.com/notes" },
          ],
        },
        // G2 × GAMER was not asked for; the cross product of the two key lists
        // can return it, and it must not leak into the map.
        { group_id: G2, participant_id: GAMER, creations: [{ title: "Other", url: "https://roblox.com/x" }] },
      ],
    });
    const creations = await readCreations(createFetchStubbedClient(fetch), [
      { group_id: G1, participant_id: GAMER },
      { group_id: G2, participant_id: GAMER_2 },
    ]);

    expect(creations).toEqual(
      new Map([
        [
          creationKey(G1, GAMER),
          [
            { title: "Obby", url: "https://www.roblox.com/games/1/Obby", is_roblox_url: true },
            { title: "Notes", url: "https://example.com/notes", is_roblox_url: false },
          ],
        ],
      ]),
    );
  });
});

// ---------------------------------------------------------------------------

describe("readRobloxAccounts", () => {
  it("reports a username with its verification, and no account without one", async () => {
    const fetch = postgrestTables({
      roblox_accounts: () => [
        { user_id: GAMER, roblox_username: "builder_ace", roblox_user_id: 123456 },
        { user_id: GAMER_2, roblox_username: "typed_by_hand", roblox_user_id: null },
        { user_id: PARENT, roblox_username: null, roblox_user_id: null },
      ],
    });
    const accounts = await readRobloxAccounts(createFetchStubbedClient(fetch), [GAMER, GAMER_2, PARENT]);

    expect(accounts).toEqual(
      new Map([
        [GAMER, { username: "builder_ace", user_id: 123456, verified: true }],
        [GAMER_2, { username: "typed_by_hand", user_id: null, verified: false }],
      ]),
    );
  });
});

// ---------------------------------------------------------------------------

describe("readProductNames", () => {
  it("collects every locale's name per product", async () => {
    const fetch = postgrestTables({
      product_translations: () => [
        { product_id: P1, locale: "en", name: "Creator Academy" },
        { product_id: P1, locale: "fr", name: "Académie des créateurs" },
        { product_id: P2, locale: "fr", name: "Stage d'été" },
      ],
    });
    const names = await readProductNames(createFetchStubbedClient(fetch), [P1, P2]);
    expect(names).toEqual(
      new Map([
        [P1, { en: "Creator Academy", fr: "Académie des créateurs" }],
        [P2, { fr: "Stage d'été" }],
      ]),
    );
  });
});

// ---------------------------------------------------------------------------

describe("readPlaces", () => {
  it("resolves each location through its ancestor chain", async () => {
    const chainNode = (id: string, type: string, name: string, parent: unknown = null) => ({
      id,
      name,
      name_i18n: null,
      type,
      parent_id: null,
      country_code: "FR",
      external_code: null,
      parent,
    });
    const fetch = postgrestTables({
      locations: () => [
        {
          ...chainNode("l-site", "site", "Lycée", chainNode("l-paris", "municipality", "Paris", chainNode("l-fr", "country", "France"))),
          created_at: "2026-01-01T00:00:00+00:00",
          updated_at: "2026-01-01T00:00:00+00:00",
        },
      ],
    });
    const places = await readPlaces(createFetchStubbedClient(fetch), ["l-site", "l-site"]);
    expect(places).toEqual(
      new Map([["l-site", { place: { city: "Paris", country_code: "FR" }, country_code: "FR" }]]),
    );
  });
});

// ---------------------------------------------------------------------------

describe("readRecordedSessionsByGroup", () => {
  it("keeps sessions with a report or a mark, attaches the marks, and groups them", async () => {
    const session = (id: string, group_id: string, report: string | null) => ({
      id,
      group_id,
      session_date: "2026-09-10",
      starts_at: "2026-09-10T15:00:00+00:00",
      ends_at: "2026-09-10T16:30:00+00:00",
      report,
    });
    const fetch = postgrestTables({
      group_sessions: () => [
        session(S1, G1, "We built an obby"),
        // A row made only for a staff note or an image: not a session (D6).
        session(S2, G1, null),
        session(S3, G2, "   "),
      ],
      session_attendance: () => [
        { session_id: S3, participant_id: GAMER, status: "present" },
        { session_id: S3, participant_id: GAMER_2, status: "absent" },
      ],
    });
    const sessions = await readRecordedSessionsByGroup(createFetchStubbedClient(fetch), [G1, G2]);

    expect([...sessions.keys()]).toEqual([G1, G2]);
    expect(sessions.get(G1)?.map((s) => [s.id, s.attendance])).toEqual([[S1, []]]);
    expect(sessions.get(G2)?.[0].attendance).toEqual([
      { participant_id: GAMER, status: "present" },
      { participant_id: GAMER_2, status: "absent" },
    ]);
  });
});
