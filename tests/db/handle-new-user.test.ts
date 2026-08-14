import { describe, it, expect, beforeAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";

/**
 * Tests for the handle_new_user() trigger — verifies that the trigger
 * ALWAYS assigns customer role regardless of metadata or email domain.
 * All other roles are promoted by server-side API routes after creation.
 */
describe("handle_new_user() role assignment", () => {
  let admin: SupabaseClient<Database>;
  const createdUserIds: string[] = [];

  beforeAll(() => {
    admin = createAdminTestClient();
  });

  afterEach(async () => {
    // Clean up any users created during tests (reverse order)
    for (const userId of createdUserIds.reverse()) {
      await admin.from("gamer_profiles").delete().eq("user_id", userId);
      await admin.from("customer_profiles").delete().eq("user_id", userId);
      await admin.from("profiles").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
    createdUserIds.length = 0;
  });

  async function createTestUser(opts: {
    email: string;
    user_metadata?: Record<string, string>;
  }) {
    const { data, error } = await admin.auth.admin.createUser({
      email: opts.email,
      password: "testpassword123",
      email_confirm: true,
      user_metadata: opts.user_metadata,
    });
    expect(error).toBeNull();
    expect(data.user).toBeTruthy();
    createdUserIds.push(data.user!.id);
    return data.user!;
  }

  async function getProfile(userId: string) {
    const { data, error } = await admin
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    expect(error).toBeNull();
    return data!;
  }

  it("blocks admin role escalation via user_metadata", async () => {
    const user = await createTestUser({
      email: "escalation-admin@test.local",
      user_metadata: { role: "admin", first_name: "Fake", last_name: "Admin" },
    });

    const profile = await getProfile(user.id);
    expect(profile.role).toBe("customer");
  });

  it("blocks gedu role escalation via user_metadata", async () => {
    const user = await createTestUser({
      email: "escalation-gedu@test.local",
      user_metadata: { role: "gedu", first_name: "Fake", last_name: "Gedu" },
    });

    const profile = await getProfile(user.id);
    expect(profile.role).toBe("customer");
  });

  it("blocks gamer role escalation via user_metadata", async () => {
    const user = await createTestUser({
      email: "escalation-gamer@test.local",
      user_metadata: { role: "gamer", first_name: "Fake", last_name: "Gamer" },
    });

    const profile = await getProfile(user.id);
    expect(profile.role).toBe("customer");
  });

  it("blocks gamer email domain from creating gamer account", async () => {
    const user = await createTestUser({
      email: "sneaky@gamer.sogverse.internal",
      user_metadata: { first_name: "Sneaky", last_name: "Gamer" },
    });

    const profile = await getProfile(user.id);
    expect(profile.role).toBe("customer");
  });

  it("defaults to customer when no role metadata is provided", async () => {
    const user = await createTestUser({
      email: "norole@test.local",
      user_metadata: { first_name: "No Role", last_name: "User" },
    });

    const profile = await getProfile(user.id);
    expect(profile.role).toBe("customer");
  });

  it("creates customer_profiles extension row for every signup", async () => {
    const user = await createTestUser({
      email: "extension@test.local",
      user_metadata: { first_name: "Extension", last_name: "Test" },
    });

    const { data, error } = await admin
      .from("customer_profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();
    expect(error).toBeNull();
    expect(data!.user_id).toBe(user.id);
  });

  // -- referral_code (00184) --
  //
  // The trigger sanitises this key in its own body rather than letting the
  // CHECK decide, and that is the whole subject here. handle_new_user writes
  // metadata straight through, so a value violating a CHECK would raise inside
  // the trigger and fail the entire auth signup — turning a stranger's
  // malformed `?ref=` in a shared link into "registration is broken for this
  // family". Every negative case below therefore asserts *both* that the value
  // is NULL and that the account exists.
  //
  // This is also the only place the trigger's copy of the rules is exercised:
  // these users are created through the admin API, so nothing lowercases or
  // trims the value on the way in the way the proxy does in a real journey.

  describe("referral_code", () => {
    it("stores a well-formed code", async () => {
      const user = await createTestUser({
        email: "referral-plain@test.local",
        user_metadata: {
          first_name: "Referred",
          last_name: "Parent",
          referral_code: "paris-nord",
        },
      });

      expect((await getProfile(user.id)).referral_code).toBe("paris-nord");
    });

    it("lowercases a mixed-case code rather than refusing it", async () => {
      // The trap this pins: testing the raw value against the lowercase-only
      // pattern and lowercasing afterwards would degrade `Paris-Nord` to NULL.
      const user = await createTestUser({
        email: "referral-case@test.local",
        user_metadata: {
          first_name: "Mixed",
          last_name: "Case",
          referral_code: "Paris-Nord",
        },
      });

      expect((await getProfile(user.id)).referral_code).toBe("paris-nord");
    });

    it("trims space padding rather than refusing it", async () => {
      // The trigger's `btrim` strips spaces only — deliberately narrower than
      // the TS sanitiser's full-whitespace trim (see src/lib/referral.ts) —
      // so this is the case that documents which copy of the rules the
      // database itself enforces.
      const user = await createTestUser({
        email: "referral-padded@test.local",
        user_metadata: {
          first_name: "Space",
          last_name: "Padded",
          referral_code: " paris-nord ",
        },
      });

      expect((await getProfile(user.id)).referral_code).toBe("paris-nord");
    });

    it("keeps hyphens, underscores and digits", async () => {
      const user = await createTestUser({
        email: "referral-charset@test.local",
        user_metadata: {
          first_name: "Charset",
          last_name: "Survivor",
          referral_code: "ecole_92-b3",
        },
      });

      expect((await getProfile(user.id)).referral_code).toBe("ecole_92-b3");
    });

    it("degrades a formula-shaped value to NULL without failing the signup", async () => {
      // The important half is that the account exists. Referral data gets
      // exported to spreadsheets, where a leading `=` executes on open — but a
      // CHECK violation here would cost a family their registration, which is
      // strictly worse than an unattributed one.
      const user = await createTestUser({
        email: "referral-formula@test.local",
        user_metadata: {
          first_name: "Formula",
          last_name: "Payload",
          referral_code: "=cmd|'/c calc'!A1",
        },
      });

      const profile = await getProfile(user.id);
      expect(profile.referral_code).toBeNull();
      expect(profile.role).toBe("customer");
    });

    it("degrades an over-64-character value to NULL rather than truncating", async () => {
      const user = await createTestUser({
        email: "referral-long@test.local",
        user_metadata: {
          first_name: "Too",
          last_name: "Long",
          referral_code: "a".repeat(65),
        },
      });

      expect((await getProfile(user.id)).referral_code).toBeNull();
    });

    it("accepts exactly 64 characters", async () => {
      const user = await createTestUser({
        email: "referral-boundary@test.local",
        user_metadata: {
          first_name: "Exactly",
          last_name: "Sixtyfour",
          referral_code: "a".repeat(64),
        },
      });

      expect((await getProfile(user.id)).referral_code).toBe("a".repeat(64));
    });

    it("degrades a disallowed character to NULL", async () => {
      const user = await createTestUser({
        email: "referral-charset-bad@test.local",
        user_metadata: {
          first_name: "Bad",
          last_name: "Charset",
          referral_code: "paris nord!",
        },
      });

      expect((await getProfile(user.id)).referral_code).toBeNull();
    });

    it("yields NULL when the key is absent entirely", async () => {
      const user = await createTestUser({
        email: "referral-absent@test.local",
        user_metadata: { first_name: "No", last_name: "Referral" },
      });

      expect((await getProfile(user.id)).referral_code).toBeNull();
    });

    it("still cannot influence the assigned role", async () => {
      // The suite's standing subject, re-run against the key 00184 added: one
      // more caller-supplied value reaching the most sensitive function in the
      // schema must widen nothing but the one nullable text column.
      const user = await createTestUser({
        email: "referral-escalation@test.local",
        user_metadata: {
          first_name: "Sneaky",
          last_name: "Referrer",
          role: "admin",
          referral_code: "paris-nord",
        },
      });

      const profile = await getProfile(user.id);
      expect(profile.role).toBe("customer");
      expect(profile.referral_code).toBe("paris-nord");
    });
  });
});

/**
 * `profiles.referral_code` is immutable provenance, which in this schema means
 * exactly one thing: there is no UPDATE grant on it, at any level, for either
 * Data API role. The authorization spine pins the *set* of updatable profile
 * columns by exact equality, so a column with no grant produces no failure there
 * either way — this is the positive assertion that the acceptance criterion
 * "an authenticated user cannot alter their own referral_code" is met rather
 * than merely implied by an absence.
 *
 * Note this is not an IDOR case: the row under attack is the caller's *own*.
 * The grant is the only thing standing between a user and rewriting their own
 * attribution, which is the whole reason this value is written by the trigger
 * instead of by the client the way `home_location_id` is.
 */
describe("profiles.referral_code is write-once", () => {
  let admin: SupabaseClient<Database>;
  let customerClient: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    customerClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
  });

  afterEach(async () => {
    await admin
      .from("profiles")
      .update({ referral_code: null })
      .eq("id", TEST_IDS.CUSTOMER);
  });

  async function storedCodeOf(userId: string) {
    const { data, error } = await admin
      .from("profiles")
      .select("referral_code")
      .eq("id", userId)
      .single();

    expect(error).toBeNull();
    return data!.referral_code;
  }

  it("a parent cannot set their own referral code", async () => {
    const { error } = await customerClient
      .from("profiles")
      .update({ referral_code: "self-awarded" })
      .eq("id", TEST_IDS.CUSTOMER);

    // 42501 = insufficient_privilege. The absence of a column grant fails the
    // statement outright rather than scoping it, which is why this asserts an
    // error where the home-location IDOR case asserts an untouched row.
    expect(error?.code).toBe("42501");
    expect(await storedCodeOf(TEST_IDS.CUSTOMER)).toBeNull();
  });

  it("a parent cannot clear a referral code an admin can see", async () => {
    await admin
      .from("profiles")
      .update({ referral_code: "paris-nord" })
      .eq("id", TEST_IDS.CUSTOMER);

    const { error } = await customerClient
      .from("profiles")
      .update({ referral_code: null })
      .eq("id", TEST_IDS.CUSTOMER);

    expect(error?.code).toBe("42501");
    expect(await storedCodeOf(TEST_IDS.CUSTOMER)).toBe("paris-nord");
  });

  it("the column is readable — no grant means no WRITE grant", async () => {
    // Without this, every negative above could pass against a column the caller
    // simply cannot see. The layout's profile query selects every column, so a
    // signed-in user reading their own value is expected and accepted.
    await admin
      .from("profiles")
      .update({ referral_code: "paris-nord" })
      .eq("id", TEST_IDS.CUSTOMER);

    const { data, error } = await customerClient
      .from("profiles")
      .select("referral_code")
      .eq("id", TEST_IDS.CUSTOMER)
      .single();

    expect(error).toBeNull();
    expect(data!.referral_code).toBe("paris-nord");
  });

  it("the CHECK is a real backstop for a service-role write", async () => {
    // The trigger degrades a malformed value to NULL, so the constraint should
    // never be reached through any application path — but service_role is the
    // one writer that bypasses it, and the constraint is what keeps a hand-run
    // psql statement from storing a payload.
    const { error } = await admin
      .from("profiles")
      .update({ referral_code: "=SUM(A1)" })
      .eq("id", TEST_IDS.CUSTOMER);

    // 23514 = check_violation.
    expect(error?.code).toBe("23514");
    expect(await storedCodeOf(TEST_IDS.CUSTOMER)).toBeNull();
  });
});
