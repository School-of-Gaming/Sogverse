import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";

/**
 * Scope test for `submit_my_feedback` — the self-scoping classification it
 * carries in the §3.4 spine's allowlist (authorization-spine.test.ts, check 5).
 *
 * The function takes no user parameter at all: the row it writes is keyed to
 * `auth.uid()`. That is the property under test here — not "does the insert
 * work", but "can a caller make the row land on someone else". With no user
 * argument to point elsewhere, the proof is that two different callers submitting
 * identical text produce rows attributed to each of them respectively, and that
 * the row is visible to its own author and nobody else.
 *
 * The rate limit is the second thing worth pinning: it is the only reason this
 * function is safe to expose to `authenticated` at all, since the route's own
 * throttling is now bypassable by calling PostgREST directly.
 */

const MESSAGE = "Seeded by feedback-submission.test.ts — scope probe";

/**
 * Every assertion below filters to these three, so a feedback row belonging to
 * some other fixture can neither mask a leak nor fail an exact-match assertion.
 */
const SCOPED_USERS: string[] = [
  TEST_IDS.CUSTOMER,
  TEST_IDS.CUSTOMER_2,
  TEST_IDS.GAMER,
];

describe("submit_my_feedback", () => {
  let admin: SupabaseClient<Database>;
  let customer: SupabaseClient<Database>;
  let customer2: SupabaseClient<Database>;
  let gamer: SupabaseClient<Database>;

  async function clearFeedback() {
    await admin
      .from("feedback_submissions")
      .delete()
      .in("user_id", SCOPED_USERS);
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    customer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    customer2 = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER_2.email,
      TEST_CREDENTIALS.CUSTOMER_2.password,
    );
    gamer = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER.email,
      TEST_CREDENTIALS.GAMER.password,
    );
    await clearFeedback();
  });

  afterEach(clearFeedback);
  afterAll(clearFeedback);

  it("attributes the row to the caller, not to any argument", async () => {
    const { data, error } = await customer.rpc("submit_my_feedback", {
      p_message: MESSAGE,
    });

    expect(error).toBeNull();
    expect(data).toBe(true);

    const { data: rows } = await admin
      .from("feedback_submissions")
      .select("user_id, message")
      .in("user_id", SCOPED_USERS);

    expect(rows).toEqual([
      { user_id: TEST_IDS.CUSTOMER, message: MESSAGE },
    ]);
  });

  it("attributes identical text from a different caller to that caller", async () => {
    await customer2.rpc("submit_my_feedback", { p_message: MESSAGE });

    const { data: rows } = await admin
      .from("feedback_submissions")
      .select("user_id")
      .in("user_id", SCOPED_USERS);

    expect(rows).toEqual([{ user_id: TEST_IDS.CUSTOMER_2 }]);
  });

  it("is open to every role — a gamer may submit feedback", async () => {
    // No role gate by design: this is why the function is classified
    // self-scoping rather than role-gated.
    const { data, error } = await gamer.rpc("submit_my_feedback", {
      p_message: MESSAGE,
    });

    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  it("does not let one caller read another's feedback row", async () => {
    await customer.rpc("submit_my_feedback", { p_message: MESSAGE });

    const { data: own } = await customer
      .from("feedback_submissions")
      .select("user_id");
    const { data: other } = await customer2
      .from("feedback_submissions")
      .select("user_id");

    expect(own).toEqual([{ user_id: TEST_IDS.CUSTOMER }]);
    expect(other).toEqual([]);
  });

  it("refuses a message outside the length bounds", async () => {
    const tooShort = await customer.rpc("submit_my_feedback", {
      p_message: "short",
    });
    const tooLong = await customer.rpc("submit_my_feedback", {
      p_message: "x".repeat(2001),
    });

    expect(tooShort.error?.code).toBe("23514");
    expect(tooLong.error?.code).toBe("23514");

    const { data: rows } = await admin
      .from("feedback_submissions")
      .select("user_id")
      .in("user_id", SCOPED_USERS);
    expect(rows).toEqual([]);
  });

  it("rate-limits the caller after six submissions in an hour", async () => {
    for (let i = 0; i < 6; i++) {
      const { data } = await customer.rpc("submit_my_feedback", {
        p_message: `${MESSAGE} ${i}`,
      });
      expect(data).toBe(true);
    }

    // Returns false rather than raising — the route maps it to 429.
    const { data: seventh, error } = await customer.rpc("submit_my_feedback", {
      p_message: `${MESSAGE} 6`,
    });
    expect(error).toBeNull();
    expect(seventh).toBe(false);

    // The limit is per caller, not global.
    const { data: otherCaller } = await customer2.rpc("submit_my_feedback", {
      p_message: MESSAGE,
    });
    expect(otherCaller).toBe(true);
  });
});
