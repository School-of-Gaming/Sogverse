import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { GET } from "@/app/api/minecraft/join-check/route";
import type { BillingMode, ParticipationStatus, ProductType, UserRole } from "@/types";
import {
  postgrestError,
  postgrestJson,
  requestedUrl,
  type FetchMock,
} from "../../mocks/postgrest-fetch";

// --- Mocks ---
//
// The route reads through the service-role factory. A real typed client runs
// against a fetch stub that answers from the two in-memory tables below,
// applying the filters the query actually sends, so a test that seeds a row
// under a different uuid or a non-active status sees it filtered out exactly as
// PostgREST would.

const db = vi.hoisted(() => ({ fetch: undefined as FetchMock | undefined }));

vi.mock("@/lib/supabase/admin", async () => {
  const { createFetchStubbedClient } = await import("../../mocks/postgrest-fetch");
  return {
    createAdminClient: () => {
      if (db.fetch === undefined) throw new Error("the database stub is not installed");
      return createFetchStubbedClient(db.fetch);
    },
  };
});

// --- Constants ---

const API_KEY = "test-api-key-32chars-minimum-here";
const MC_UUID_DASHED = "069a79f4-44e9-4726-a5be-fca90e38aaf5";
const MC_UUID_UNDASHED = "069a79f444e94726a5befca90e38aaf5";
const OTHER_UUID = "11111111-2222-4333-8444-555555555555";

// --- Fixture tables ---

interface AccountRow {
  user_id: string;
  minecraft_uuid: string;
  minecraft_username: string | null;
  first_name: string;
  role: UserRole;
}

interface SeatRow {
  participant_id: string;
  status: ParticipationStatus;
  name: string;
  product_type: ProductType;
  billing_mode: BillingMode;
  start_date: string;
  end_date: string | null;
}

let accounts: AccountRow[];
let seats: SeatRow[];
let failTable: string | null;

function installDatabase() {
  db.fetch = vi.fn<typeof fetch>(async (input) => {
    const url = requestedUrl(input);
    const table = url.pathname.replace("/rest/v1/", "");
    if (table === failTable) return postgrestError("connection refused", 500);
    const params = url.searchParams;

    if (table === "minecraft_accounts") {
      const uuid = params.get("minecraft_uuid")?.replace(/^eq\./, "");
      return postgrestJson(
        accounts
          .filter((row) => row.minecraft_uuid === uuid)
          .map((row) => ({
            user_id: row.user_id,
            minecraft_username: row.minecraft_username,
            profile: { first_name: row.first_name, role: row.role },
          })),
      );
    }

    if (table === "participations") {
      const ids = (params.get("participant_id") ?? "")
        .replace(/^in\.\(|\)$/g, "")
        .split(",");
      const status = params.get("status")?.replace(/^eq\./, "");
      return postgrestJson(
        seats
          .filter((row) => ids.includes(row.participant_id) && row.status === status)
          .map((row) => ({
            participant_id: row.participant_id,
            status: row.status,
            product: {
              product_type: row.product_type,
              billing_mode: row.billing_mode,
              start_date: row.start_date,
              end_date: row.end_date,
              timezone: "Europe/Helsinki",
              product_translations: [
                { locale: "fi", name: `${row.name} (fi)` },
                { locale: "en", name: row.name },
              ],
            },
          })),
      );
    }

    throw new Error(`unexpected request to ${url.pathname}`);
  });
}

function account(overrides: Partial<AccountRow> & Pick<AccountRow, "user_id">): AccountRow {
  return {
    minecraft_uuid: MC_UUID_DASHED,
    minecraft_username: "SharedMC",
    first_name: "Aino",
    role: "gamer",
    ...overrides,
  };
}

function seat(overrides: Partial<SeatRow> & Pick<SeatRow, "participant_id">): SeatRow {
  return {
    status: "active",
    name: "Minecraft Bedrock Club",
    product_type: "consumer_club",
    billing_mode: "paid",
    start_date: "2026-09-01",
    end_date: null,
    ...overrides,
  };
}

// --- Helpers ---

function createRequest(uuid?: string, apiKey?: string | null): Request {
  const url = uuid
    ? `http://localhost:3000/api/minecraft/join-check?uuid=${uuid}`
    : "http://localhost:3000/api/minecraft/join-check";
  const headers: Record<string, string> = {};
  // eslint-disable-next-line security/detect-possible-timing-attacks -- test helper, not an auth comparison; `apiKey !== null` just distinguishes "omit header" (null) from "use this value" (string)
  if (apiKey !== null) {
    headers["Authorization"] = apiKey ?? `Bearer ${API_KEY}`;
  }
  return new Request(url, { method: "GET", headers });
}

async function check(uuid = MC_UUID_DASHED) {
  const response = await GET(createRequest(uuid));
  return { status: response.status, body: await response.json() };
}

// --- Tests ---

describe("GET /api/minecraft/join-check", () => {
  beforeEach(() => {
    vi.stubEnv("MINECRAFT_SERVER_API_KEY", API_KEY);
    accounts = [];
    seats = [];
    failTable = null;
    installDatabase();
  });
  // The node project shares a worker between files, so the stub is handed back.
  afterEach(() => vi.unstubAllEnvs());

  // --- Auth ---

  it("returns 401 for missing Authorization header", async () => {
    const response = await GET(createRequest(MC_UUID_DASHED, null));
    expect(response.status).toBe(401);
  });

  it("returns 401 for non-Bearer format", async () => {
    const response = await GET(createRequest(MC_UUID_DASHED, `Basic ${API_KEY}`));
    expect(response.status).toBe(401);
  });

  it("returns 401 for a wrong key of a different length", async () => {
    // Rejected by the length guard, before timingSafeEqual is reached.
    const response = await GET(createRequest(MC_UUID_DASHED, "Bearer wrong-key"));
    expect(response.status).toBe(401);
  });

  it("returns 401 for a wrong key of the SAME length", async () => {
    // The case that actually reaches timingSafeEqual — the other tests all stop
    // at the length guard, so without this the constant-time compare is never
    // executed and reordering the two could go unnoticed.
    const response = await GET(
      createRequest(MC_UUID_DASHED, `Bearer ${API_KEY.slice(0, -1)}X`),
    );
    expect(response.status).toBe(401);
  });

  it("returns 500 when MINECRAFT_SERVER_API_KEY is not set", async () => {
    vi.stubEnv("MINECRAFT_SERVER_API_KEY", "");
    const response = await GET(createRequest(MC_UUID_DASHED));
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("Server misconfigured");
  });

  it("rejects an unauthenticated caller before looking at the uuid", async () => {
    // Auth precedes validation, so a bad key with a malformed uuid is a 401 — a
    // caller without the key cannot probe the input handling.
    const response = await GET(createRequest("not-a-uuid", "Bearer wrong-key"));
    expect(response.status).toBe(401);
    expect(db.fetch).not.toHaveBeenCalled();
  });

  // --- Validation ---

  it("returns 400 for missing uuid param", async () => {
    const response = await GET(createRequest(undefined));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("uuid");
  });

  it("returns 400 for malformed uuid", async () => {
    const response = await GET(createRequest("not-a-uuid"));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Invalid");
    expect(db.fetch).not.toHaveBeenCalled();
  });

  // --- Decisions ---

  it("denies a uuid no account has linked", async () => {
    accounts = [account({ user_id: "aino", minecraft_uuid: OTHER_UUID })];
    seats = [seat({ participant_id: "aino" })];

    const { status, body } = await check();
    expect(status).toBe(200);
    expect(body).toEqual({
      allowed: false,
      reason: "no_linked_account",
      message: expect.any(String),
      gamers: [],
    });
  });

  it("denies a uuid linked only to a gedu, without naming the gedu", async () => {
    accounts = [account({ user_id: "gedu", role: "gedu", first_name: "Gedulina" })];
    seats = [seat({ participant_id: "gedu" })];

    const { status, body } = await check();
    expect(status).toBe(200);
    expect(body).toMatchObject({
      allowed: false,
      reason: "no_linked_gamer",
      gamers: [],
    });
    expect(JSON.stringify(body)).not.toContain("Gedulina");
  });

  it("denies a gamer whose only seats are free, municipality or waitlisted", async () => {
    accounts = [account({ user_id: "aino", minecraft_username: "AinoMC" })];
    seats = [
      seat({ participant_id: "aino", name: "Free Event", product_type: "event", billing_mode: "free", start_date: "2026-11-01", end_date: "2026-11-01" }),
      seat({ participant_id: "aino", name: "School Club", product_type: "municipality_club", billing_mode: "external_contract", start_date: "2026-08-15", end_date: "2026-12-15" }),
      seat({ participant_id: "aino", name: "Waitlisted Club", status: "waitlisted" }),
    ];

    const { status, body } = await check();
    expect(status).toBe(200);
    expect(body.allowed).toBe(false);
    expect(body.reason).toBe("no_paid_enrollment");
    expect(body.gamers).toEqual([
      {
        firstName: "Aino",
        minecraftUsername: "AinoMC",
        // Only active seats are listed, none qualifying, by start date.
        enrollments: [
          {
            product: "School Club",
            productType: "municipality_club",
            billingMode: "external_contract",
            startDate: "2026-08-15",
            endDate: "2026-12-15",
            qualifies: false,
          },
          {
            product: "Free Event",
            productType: "event",
            billingMode: "free",
            startDate: "2026-11-01",
            endDate: "2026-11-01",
            qualifies: false,
          },
        ],
      },
    ]);
  });

  it("allows a gamer with an active paid seat", async () => {
    accounts = [account({ user_id: "aino", minecraft_username: "AinoMC" })];
    seats = [seat({ participant_id: "aino" })];

    const { status, body } = await check();
    expect(status).toBe(200);
    expect(body).toEqual({
      allowed: true,
      reason: "paid_enrollment",
      message: "Allowed: Aino has a paid seat on Minecraft Bedrock Club.",
      gamers: [
        {
          firstName: "Aino",
          minecraftUsername: "AinoMC",
          enrollments: [
            {
              product: "Minecraft Bedrock Club",
              productType: "consumer_club",
              billingMode: "paid",
              startDate: "2026-09-01",
              endDate: null,
              qualifies: true,
            },
          ],
        },
      ],
    });
  });

  it("allows a shared uuid when only one sibling qualifies, listing both", async () => {
    accounts = [
      account({ user_id: "eero", first_name: "Eero" }),
      account({ user_id: "aino", first_name: "Aino" }),
    ];
    seats = [
      seat({ participant_id: "eero" }),
      seat({ participant_id: "aino", name: "School Club", product_type: "municipality_club", billing_mode: "external_contract", end_date: "2026-12-15" }),
    ];

    const { status, body } = await check();
    expect(status).toBe(200);
    expect(body.allowed).toBe(true);
    expect(body.message).toBe("Allowed: Eero has a paid seat on Minecraft Bedrock Club.");
    expect(body.gamers.map((g: { firstName: string }) => g.firstName)).toEqual([
      "Aino",
      "Eero",
    ]);
  });

  it.each([
    ["dashed", MC_UUID_DASHED],
    ["undashed", MC_UUID_UNDASHED],
    ["upper-case", MC_UUID_UNDASHED.toUpperCase()],
  ])("matches the stored uuid when the caller sends it %s", async (_, uuid) => {
    accounts = [account({ user_id: "aino" })];
    seats = [seat({ participant_id: "aino" })];

    const { body } = await check(uuid);
    expect(body.allowed).toBe(true);
  });

  it.each(["minecraft_accounts", "participations"])(
    "answers 500 when the %s read fails",
    async (table) => {
      accounts = [account({ user_id: "aino" })];
      seats = [seat({ participant_id: "aino" })];
      failTable = table;
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      const { status, body } = await check();
      expect(status).toBe(500);
      expect(body).toEqual({ error: "Failed to check access" });
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    },
  );
});
