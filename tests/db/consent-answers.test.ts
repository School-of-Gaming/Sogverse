import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import type { Database } from "@/types/database.types";
import { consentAnswerTotalsResult } from "@/lib/consent-answers.contracts";
import {
  accessTokenFor,
  callRpcRaw,
  createAdminTestClient,
  createAuthenticatedClient,
} from "./helpers";
import { TEST_CREDENTIALS } from "./constants";

/**
 * The cookie banner's tally — consent_answer_counts, its one writer and its two
 * readers.
 *
 * What matters: a count is one row per (UTC day, answer, page) however many
 * answers it stands for, a missing page included; a read sums exactly the days
 * asked for; and nobody but the service role writes, while an admin's session
 * reads through the guarded wrapper and every other role reads nothing.
 *
 * seed.sql holds no counts, so the table is emptied around each test.
 */

/** The canonical forbidden SQLSTATE a missing grant or a guard produces. */
const FORBIDDEN = "42501";

function utcToday(): string {
  return formatInTimeZone(new Date(), "UTC", "yyyy-MM-dd");
}

describe("consent answer tally", () => {
  let admin: SupabaseClient<Database>;

  async function emptyTable() {
    const { error } = await admin
      .from("consent_answer_counts")
      .delete()
      .not("day", "is", null);
    expect(error).toBeNull();
  }

  async function rows() {
    const { data, error } = await admin
      .from("consent_answer_counts")
      .select("day, answer, page, count")
      .order("answer");
    expect(error).toBeNull();
    return data ?? [];
  }

  /**
   * The rows a pair of counts made today. The two calls can straddle UTC
   * midnight, which is two days and so two rows; every claim below holds on
   * the sum and on the day each row carries, whichever happened.
   */
  async function countTwice(
    args: Database["public"]["Functions"]["count_consent_answer"]["Args"],
  ) {
    const before = utcToday();
    for (let i = 0; i < 2; i++) {
      const { error } = await admin.rpc("count_consent_answer", args);
      expect(error).toBeNull();
    }
    const after = utcToday();
    const counted = await rows();
    expect(counted.length).toBe(before === after ? 1 : 2);
    for (const row of counted) expect([before, after]).toContain(row.day);
    return counted;
  }

  beforeAll(() => {
    admin = createAdminTestClient();
  });

  beforeEach(emptyTable);
  afterAll(emptyTable);

  describe("count_consent_answer()", () => {
    it("counts repeated answers on one page into one row", async () => {
      const counted = await countTwice({ p_answer: "all", p_page: "/shop" });

      expect(counted.map((row) => [row.answer, row.page])).toEqual(
        counted.map(() => ["all", "/shop"]),
      );
      expect(counted.reduce((sum, row) => sum + row.count, 0)).toBe(2);
    });

    it("counts repeated answers on no page into one row too", async () => {
      const counted = await countTwice({ p_answer: "none" });

      expect(counted.every((row) => row.page === null)).toBe(true);
      expect(counted.reduce((sum, row) => sum + row.count, 0)).toBe(2);
    });

    it("keeps each answer and each page apart", async () => {
      for (const args of [
        { p_answer: "all" as const, p_page: "/shop" },
        { p_answer: "none" as const, p_page: "/shop" },
        { p_answer: "all" as const, p_page: "/" },
        { p_answer: "all" as const },
      ]) {
        const { error } = await admin.rpc("count_consent_answer", args);
        expect(error).toBeNull();
      }

      const counted = await rows();
      expect(counted.every((row) => row.count === 1)).toBe(true);
      expect(new Set(counted.map((row) => `${row.answer} ${row.page}`))).toEqual(
        new Set(["all /shop", "none /shop", "all /", "all null"]),
      );
    });

    it("refuses a page that is not a path", async () => {
      const { error } = await admin.rpc("count_consent_answer", {
        p_answer: "all",
        p_page: "shop",
      });
      expect(error?.code).toBe("23514");
    });
  });

  describe("the totals", () => {
    beforeEach(async () => {
      const { error } = await admin.from("consent_answer_counts").insert([
        { day: "2026-03-01", answer: "all", page: "/shop", count: 3 },
        { day: "2026-03-02", answer: "all", page: "/shop", count: 4 },
        { day: "2026-03-02", answer: "none", page: "/shop", count: 2 },
        { day: "2026-03-02", answer: "analytics_only", page: null, count: 5 },
        { day: "2026-03-03", answer: "analytics_only", page: null, count: 6 },
        // Outside the range on either side.
        { day: "2026-02-28", answer: "all", page: "/shop", count: 100 },
        { day: "2026-03-04", answer: "none", page: null, count: 100 },
      ]);
      expect(error).toBeNull();
    });

    const RANGE = { p_from: "2026-03-01", p_to: "2026-03-03" };
    const EXPECTED = [
      { page: null, answer: "analytics_only", count: 11 },
      { page: "/shop", answer: "all", count: 7 },
      { page: "/shop", answer: "none", count: 2 },
    ];

    it("sum each (page, answer) over the days asked for, both ends included", async () => {
      const { data, error } = await admin.rpc("consent_answer_totals", RANGE);
      expect(error).toBeNull();

      expect(consentAnswerTotalsResult.parse(data)).toEqual(EXPECTED);
    });

    it("read the same for an admin's own session", async () => {
      const client = await createAuthenticatedClient(
        TEST_CREDENTIALS.ADMIN.email,
        TEST_CREDENTIALS.ADMIN.password,
      );
      const { data, error } = await client.rpc(
        "get_admin_consent_answer_totals",
        RANGE,
      );
      expect(error).toBeNull();

      expect(consentAnswerTotalsResult.parse(data)).toEqual(EXPECTED);
    });

    it("answer nothing for a range with no counts", async () => {
      const { data, error } = await admin.rpc("consent_answer_totals", {
        p_from: "2025-01-01",
        p_to: "2025-01-31",
      });
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe("access", () => {
    it("lets no signed-in role write, read the table or read the service-role totals", async () => {
      for (const credentials of [
        TEST_CREDENTIALS.ADMIN,
        TEST_CREDENTIALS.CUSTOMER,
      ]) {
        const token = await accessTokenFor(
          credentials.email,
          credentials.password,
        );
        const write = await callRpcRaw(token, "count_consent_answer", {
          p_answer: "all",
          p_page: null,
        });
        expect(write.code).toBe(FORBIDDEN);

        const totals = await callRpcRaw(token, "consent_answer_totals", {
          p_from: "2026-03-01",
          p_to: "2026-03-03",
        });
        expect(totals.code).toBe(FORBIDDEN);

        const client = await createAuthenticatedClient(
          credentials.email,
          credentials.password,
        );
        const { error } = await client
          .from("consent_answer_counts")
          .select("count");
        expect(error?.code).toBe(FORBIDDEN);
      }

      expect(await rows()).toEqual([]);
    });

    it("refuses the admin read to anyone but an admin", async () => {
      const token = await accessTokenFor(
        TEST_CREDENTIALS.CUSTOMER.email,
        TEST_CREDENTIALS.CUSTOMER.password,
      );
      const result = await callRpcRaw(token, "get_admin_consent_answer_totals", {
        p_from: "2026-03-01",
        p_to: "2026-03-03",
      });
      expect(result.code).toBe(FORBIDDEN);
    });
  });
});
