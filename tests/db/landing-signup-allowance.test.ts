import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS } from "./constants";

/**
 * `take_landing_signup_allowance` — the rate limit in front of the landing
 * pages' email sign-up, which is what stops the public form being used to make
 * Brevo mail strangers. Pinned: ten sign-ups an hour per key and not one more,
 * keys counted apart, an attempt older than the hour pruned and no longer
 * counted, and nobody but the service role able to call it or read the rows.
 */

/** A client key in the stored shape, distinct per name and per run. */
const RUN = Date.now().toString(36);
const key = (name: string) =>
  createHash("sha256").update(`landing-signup-allowance-test:${RUN}:${name}`).digest("hex");

const KEY_A = key("a");
const KEY_B = key("b");
const KEY_OLD = key("old");

describe("take_landing_signup_allowance", () => {
  let admin: SupabaseClient<Database>;

  async function clear() {
    await admin
      .from("landing_signup_attempts")
      .delete()
      .in("client_key", [KEY_A, KEY_B, KEY_OLD]);
  }

  async function take(clientKey: string): Promise<boolean | null> {
    const { data, error } = await admin.rpc("take_landing_signup_allowance", {
      p_client_key: clientKey,
    });
    if (error) throw error;
    return data;
  }

  beforeAll(() => {
    admin = createAdminTestClient();
  });
  beforeEach(clear);
  afterAll(clear);

  it("grants ten an hour per key, then refuses, counting keys apart", async () => {
    for (let n = 0; n < 10; n++) expect(await take(KEY_A)).toBe(true);
    expect(await take(KEY_A)).toBe(false);
    expect(await take(KEY_B)).toBe(true);

    const { count } = await admin
      .from("landing_signup_attempts")
      .select("id", { count: "exact", head: true })
      .eq("client_key", KEY_A);
    // A refusal records nothing.
    expect(count).toBe(10);
  });

  it("prunes attempts older than the hour, which then no longer count", async () => {
    const hourAgo = new Date(Date.now() - 61 * 60 * 1000).toISOString();
    const { error } = await admin.from("landing_signup_attempts").insert(
      Array.from({ length: 10 }, () => ({ client_key: KEY_OLD, attempted_at: hourAgo })),
    );
    if (error) throw error;

    expect(await take(KEY_OLD)).toBe(true);
    const { count } = await admin
      .from("landing_signup_attempts")
      .select("id", { count: "exact", head: true })
      .eq("client_key", KEY_OLD);
    expect(count).toBe(1);
  });

  it("refuses a key that is not a sha256", async () => {
    await expect(take("203.0.113.7")).rejects.toMatchObject({ code: "23514" });
  });

  it("is the service role's alone", async () => {
    const customer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    const { error: callError } = await customer.rpc("take_landing_signup_allowance", {
      p_client_key: KEY_A,
    });
    expect(callError?.code).toBe("42501");
    const { error: readError } = await customer.from("landing_signup_attempts").select("id");
    expect(readError?.code).toBe("42501");
  });
});
