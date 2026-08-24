import { describe, it, expect, beforeAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  createAdminTestClient,
  createAuthenticatedClient,
  accessTokenFor,
  patchRaw,
} from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";

/**
 * What guards `profiles.spoken_languages`, and which half guards what.
 *
 * Since 00199 the column is `spoken_language[]`, so **which values are legal is
 * the column type's job** — a code we do not offer cannot be stored, and cannot
 * even be written from application code, because the generated types are the
 * enum. What the type cannot say is that a language appears at most once, so
 * `trg_validate_profile_spoken_languages` was trimmed to exactly that rule and
 * still fires on every write.
 *
 * Both halves are exercised here, from opposite directions. Uniqueness goes
 * through the typed client, because `['fi','fi']` is a perfectly well-typed
 * value. Membership cannot: the request has to be built without the generated
 * types (see `patchRaw`), and that is not a workaround — `authenticated` holds a
 * column-level UPDATE grant on this column, so a hand-written PATCH is a path a
 * real caller has and the database is the only thing standing in it.
 */
describe("Profile spoken_languages validation", () => {
  let admin: SupabaseClient<Database>;
  let customer: SupabaseClient<Database>;
  let customerToken: string;

  beforeAll(async () => {
    admin = createAdminTestClient();
    customer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password
    );
    customerToken = await accessTokenFor(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password
    );
  });

  afterEach(async () => {
    // Reset spoken_languages to empty array
    await admin
      .from("profiles")
      .update({ spoken_languages: [] })
      .eq("id", TEST_IDS.CUSTOMER);
  });

  it("accepts valid language codes", async () => {
    const { error } = await customer
      .from("profiles")
      .update({ spoken_languages: ["fi", "en"] })
      .eq("id", TEST_IDS.CUSTOMER);

    expect(error).toBeNull();
  });

  it("accepts an empty array", async () => {
    const { error } = await customer
      .from("profiles")
      .update({ spoken_languages: [] })
      .eq("id", TEST_IDS.CUSTOMER);

    expect(error).toBeNull();
  });

  it("rejects a code that is not a spoken_language", async () => {
    const result = await patchRaw(
      customerToken,
      `profiles?id=eq.${TEST_IDS.CUSTOMER}`,
      { spoken_languages: ["fi", "xx"] }
    );

    // 22P02 is invalid_text_representation — Postgres refusing to read "xx" as
    // a member of the enum, which is the column type doing the work the
    // trigger's reference-table lookup used to do.
    expect(result.code).toBe("22P02");
  });

  it("rejects duplicate language codes", async () => {
    const { error } = await customer
      .from("profiles")
      .update({ spoken_languages: ["fi", "fi"] })
      .eq("id", TEST_IDS.CUSTOMER);

    expect(error).not.toBeNull();
    expect(error!.message).toContain("Duplicate language codes");
  });
});
