import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { VerificationEmailRequest } from "@/types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";

/**
 * Scope test for `request_my_verification_email` — the self-scoping
 * classification it carries in the §3.4 spine's allowlist
 * (authorization-spine.test.ts, check 5).
 *
 * The function takes no argument at all: the row it writes and the rows it
 * counts are both keyed to `auth.uid()`. That is the property under test — not
 * "does the insert work", but "can a caller spend, or clear, somebody else's
 * hourly allowance". With no user argument to point elsewhere, the proof is that
 * two callers hold two independent counts, and that the table itself is
 * unreachable through the Data API, so the only way a row ever appears is this
 * function.
 *
 * The rate limit is the whole reason the function exists: the verification-email
 * send spends a message from the shared Brevo quota — the same quota
 * password-reset mail draws on — and the route's own throttling would be
 * per-instance and bypassable by calling PostgREST directly.
 */

/**
 * Every assertion below filters to these three, so a request row belonging to
 * some other fixture can neither mask a leak nor fail an exact-match assertion.
 */
const SCOPED_USERS: string[] = [
  TEST_IDS.CUSTOMER,
  TEST_IDS.CUSTOMER_2,
  TEST_IDS.GAMER,
];

describe("request_my_verification_email", () => {
  let admin: SupabaseClient<Database>;
  let customer: SupabaseClient<Database>;
  let customer2: SupabaseClient<Database>;
  let gamer: SupabaseClient<Database>;

  async function clearRequests() {
    await admin
      .from("verification_email_requests")
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
    await clearRequests();
  });

  afterEach(clearRequests);
  afterAll(clearRequests);

  it("attributes the row to the caller, not to any argument", async () => {
    const { data, error } = await customer.rpc(
      "request_my_verification_email",
    );

    expect(error).toBeNull();
    expect(data).toBe(true);

    const { data: rows } = await admin
      .from("verification_email_requests")
      .select("user_id")
      .in("user_id", SCOPED_USERS);

    expect(rows).toEqual([{ user_id: TEST_IDS.CUSTOMER }]);
  });

  it("rate-limits the caller after six requests in an hour", async () => {
    for (let i = 0; i < 6; i++) {
      const { data } = await customer.rpc("request_my_verification_email");
      expect(data, `call ${i + 1} of 6`).toBe(true);
    }

    // Returns false rather than raising — the route maps it to 429.
    const { data: seventh, error } = await customer.rpc(
      "request_my_verification_email",
    );
    expect(error).toBeNull();
    expect(seventh).toBe(false);

    // The limit is per caller, not global.
    const { data: otherCaller } = await customer2.rpc(
      "request_my_verification_email",
    );
    expect(otherCaller).toBe(true);
  });

  it("prunes the caller's expired rows on the way past", async () => {
    // These rows are pure bookkeeping — nothing reads them but the function's
    // own count — so one outside the window can never matter again and the RPC
    // deletes it rather than leaving the table to grow forever.
    const { error: seedError } = await admin
      .from("verification_email_requests")
      .insert({
        user_id: TEST_IDS.CUSTOMER,
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      });
    expect(seedError).toBeNull();

    // The expired row must not count against the limit either.
    const { data: accepted } = await customer.rpc(
      "request_my_verification_email",
    );
    expect(accepted).toBe(true);

    const { data } = await admin
      .from("verification_email_requests")
      .select("user_id, created_at")
      .in("user_id", SCOPED_USERS);
    const rows = (data ?? []) as Pick<
      VerificationEmailRequest,
      "user_id" | "created_at"
    >[];

    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(TEST_IDS.CUSTOMER);
    expect(
      Date.now() - new Date(rows[0].created_at).getTime(),
      "the surviving row is the fresh one",
    ).toBeLessThan(60 * 60 * 1000);
  });

  it("prunes only the caller's own expired rows", async () => {
    const twoHoursAgo = new Date(
      Date.now() - 2 * 60 * 60 * 1000,
    ).toISOString();
    await admin.from("verification_email_requests").insert([
      { user_id: TEST_IDS.CUSTOMER, created_at: twoHoursAgo },
      { user_id: TEST_IDS.CUSTOMER_2, created_at: twoHoursAgo },
    ]);

    await customer.rpc("request_my_verification_email");

    const { data: survivors } = await admin
      .from("verification_email_requests")
      .select("user_id")
      .in("user_id", SCOPED_USERS)
      .lt("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

    // The other caller's expired row is still there: the DELETE is keyed to
    // auth.uid() exactly as the INSERT and the count are.
    expect(survivors).toEqual([{ user_id: TEST_IDS.CUSTOMER_2 }]);
  });

  it("has no role gate — a gamer may call it too", async () => {
    // No guard by design: this is why the function is classified self-scoping
    // rather than role-gated. Gamers are excluded by the ROUTE, because nobody
    // reads their synthetic `@gamer.sogverse.internal` address — which is a fact
    // about inboxes, not about authority, and so is not the database's to
    // enforce.
    const { data, error } = await gamer.rpc("request_my_verification_email");

    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  it("keeps the ledger unreadable and unwritable through the Data API", async () => {
    // The count is only trustworthy if the rows are. A caller who could DELETE
    // their own rows would clear their own limit, so the table carries no grant
    // at all and this RPC is the only way one ever appears.
    await customer.rpc("request_my_verification_email");

    const read = await customer
      .from("verification_email_requests")
      .select("user_id");
    expect(read.error, "authenticated must not be able to read the ledger").not.toBeNull();

    const wipe = await customer
      .from("verification_email_requests")
      .delete()
      .eq("user_id", TEST_IDS.CUSTOMER);
    expect(wipe.error, "authenticated must not be able to clear the ledger").not.toBeNull();

    const { data: rows } = await admin
      .from("verification_email_requests")
      .select("user_id")
      .in("user_id", SCOPED_USERS);
    expect(rows).toEqual([{ user_id: TEST_IDS.CUSTOMER }]);
  });
});
