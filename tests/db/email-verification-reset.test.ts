import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient } from "./helpers";
import { TEST_IDS } from "./constants";

/**
 * `trg_reset_email_verification` (00186) — the half of the email-verification
 * design that no application code can be trusted with.
 *
 * `profiles.email_verified_at` is a claim about ONE address, not about the
 * account. Let it survive an email change and it silently becomes a claim about
 * whatever address is there now — which nobody ever proved, and which is exactly
 * the state an attacker holding a stolen session would want to manufacture. The
 * trigger empties the stamp whenever `email` actually moves, so the guarantee
 * holds for every writer, including one that has not been written yet.
 *
 * Two of the three cases below are about the trigger firing; the third is about
 * it NOT firing, and that one is the reason the body tests `IS DISTINCT FROM`
 * rather than trusting `UPDATE OF email` to mean "email changed". `UPDATE OF`
 * fires on any statement whose SET list mentions the column, a same-value
 * rewrite included — so a server-side re-save of an unchanged profile would
 * un-verify a family for nothing.
 *
 * Everything runs on the admin client: the column has no UPDATE grant to
 * `authenticated` or `anon` at any level (00186 asserts that from the catalog at
 * apply time), so service-role is the only writer there is.
 */

/**
 * One seeded profile is borrowed and put back. `email` and `email_verified_at`
 * are what the trigger reads and writes; `first_name` is the unrelated column
 * the third case updates. Captured once, restored after every test — the db
 * config runs files serially, so nothing observes the row mid-test.
 */
const SUBJECT = TEST_IDS.CUSTOMER_2;

const STAMP = "2026-03-01T10:00:00+00:00";

describe("trg_reset_email_verification", () => {
  let admin: SupabaseClient<Database>;
  let original: { email: string; first_name: string };
  /** Cannot collide with anything seeded or real: nobody owns `.invalid`. */
  let changedEmail: string;

  async function setSubject(patch: {
    email?: string;
    email_verified_at?: string | null;
    first_name?: string;
  }) {
    const { error } = await admin
      .from("profiles")
      .update(patch)
      .eq("id", SUBJECT);
    expect(error).toBeNull();
  }

  async function readSubject() {
    const { data, error } = await admin
      .from("profiles")
      .select("email, email_verified_at, first_name")
      .eq("id", SUBJECT)
      .single();
    expect(error).toBeNull();
    if (!data) throw new Error(`profile ${SUBJECT} is missing from the seed`);
    return data;
  }

  async function restore() {
    // Two statements on purpose. The first moves `email` back, which fires the
    // trigger and nulls the stamp; only then is it safe to set the stamp itself.
    await setSubject({ email: original.email, first_name: original.first_name });
    await setSubject({ email_verified_at: null });
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    const row = await readSubject();
    original = { email: row.email, first_name: row.first_name };
    changedEmail = `${SUBJECT}@changed.invalid`;
    expect(
      original.email,
      "the borrowed profile must not already hold the address this test changes it to",
    ).not.toBe(changedEmail);
    await restore();
  });

  afterEach(restore);
  afterAll(restore);

  it("clears the stamp when the address actually changes", async () => {
    await setSubject({ email_verified_at: STAMP });
    expect((await readSubject()).email_verified_at).not.toBeNull();

    await setSubject({ email: changedEmail });

    const after = await readSubject();
    expect(after.email).toBe(changedEmail);
    expect(
      after.email_verified_at,
      "a proof about the old address must not follow the account onto a new one",
    ).toBeNull();
  });

  it("leaves the stamp alone when the address is rewritten to the same value", async () => {
    await setSubject({ email_verified_at: STAMP });
    const before = await readSubject();

    // `UPDATE OF email` fires here — the column is in the SET list — so this is
    // the case the IS DISTINCT FROM test in the trigger body exists for.
    await setSubject({ email: original.email });

    const after = await readSubject();
    expect(after.email).toBe(original.email);
    expect(after.email_verified_at).toBe(before.email_verified_at);
  });

  it("keeps the stamp, to the moment, across an unrelated profile update", async () => {
    await setSubject({ email_verified_at: STAMP });
    const before = await readSubject();

    await setSubject({ first_name: "Renamed" });

    const after = await readSubject();
    expect(after.first_name).toBe("Renamed");
    expect(after.email).toBe(original.email);
    // The exact value, not merely "still not null": the *when* is the part of
    // this column that answers questions later, and a trigger that re-stamped it
    // would pass a null check while destroying the fact.
    expect(after.email_verified_at).toBe(before.email_verified_at);
    expect(new Date(String(after.email_verified_at)).toISOString()).toBe(
      new Date(STAMP).toISOString(),
    );
  });
});
