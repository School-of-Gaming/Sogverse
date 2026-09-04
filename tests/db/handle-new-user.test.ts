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

  // -- utm_source / utm_medium / utm_campaign (00234) --
  //
  // The trigger sanitises these three keys in its own body rather than letting
  // the CHECKs decide, and that is the whole subject here. handle_new_user
  // writes metadata straight through, so a value violating a CHECK would raise
  // inside the trigger and fail the entire auth signup — turning a stranger's
  // malformed `utm_campaign` in a shared link into "registration is broken for
  // this family". Every negative case below therefore asserts *both* that the
  // value is NULL and that the account exists.
  //
  // This is also the only place the trigger's copy of the rules is exercised:
  // these users are created through the admin API, so nothing trims the value
  // on the way in the way the proxy does in a real journey.
  //
  // The cases run against `utm_campaign` unless a case is specifically about
  // the fields being independent — the three share one predicate, written out
  // three times in the migration, and the last test in the block is what pins
  // that the copies agree.

  describe("the utm columns", () => {
    it("stores all three well-formed values", async () => {
      const user = await createTestUser({
        email: "utm-plain@test.local",
        user_metadata: {
          first_name: "Attributed",
          last_name: "Parent",
          utm_source: "lynx",
          utm_medium: "email",
          utm_campaign: "lynx-summer-a",
        },
      });

      const profile = await getProfile(user.id);
      expect(profile.utm_source).toBe("lynx");
      expect(profile.utm_medium).toBe("email");
      expect(profile.utm_campaign).toBe("lynx-summer-a");
    });

    it("preserves case rather than folding it", async () => {
      // The trap 00184 had the opposite of: that column lowercased, and this
      // one must not, because Vercel reports UTM values case-sensitively and
      // folding would make our numbers disagree with theirs.
      const user = await createTestUser({
        email: "utm-case@test.local",
        user_metadata: {
          first_name: "Mixed",
          last_name: "Case",
          utm_campaign: "Lynx-Summer-A",
        },
      });

      expect((await getProfile(user.id)).utm_campaign).toBe("Lynx-Summer-A");
    });

    it("trims space padding rather than refusing it", async () => {
      // The trigger's `btrim` strips spaces only — deliberately narrower than
      // the TS sanitiser's full-whitespace trim (see src/lib/utm.ts) — so this
      // is the case that documents which copy of the rules the database itself
      // enforces.
      const user = await createTestUser({
        email: "utm-padded@test.local",
        user_metadata: {
          first_name: "Space",
          last_name: "Padded",
          utm_campaign: " lynx-summer-a ",
        },
      });

      expect((await getProfile(user.id)).utm_campaign).toBe("lynx-summer-a");
    });

    it("accepts what an ad platform actually emits", async () => {
      // Spaces, dots, plus signs, uppercase, accents and percent literals all
      // stand. The old `?ref=` pattern rejected every one of them, which is
      // most of real UTM traffic.
      const user = await createTestUser({
        email: "utm-realistic@test.local",
        user_metadata: {
          first_name: "Ad",
          last_name: "Platform",
          utm_source: "google.com",
          utm_medium: "paid social",
          utm_campaign: "Rentrée scolaire — 20% off",
        },
      });

      const profile = await getProfile(user.id);
      expect(profile.utm_source).toBe("google.com");
      expect(profile.utm_medium).toBe("paid social");
      expect(profile.utm_campaign).toBe("Rentrée scolaire — 20% off");
    });

    it("degrades a formula-shaped value to NULL without failing the signup", async () => {
      // The important half is that the account exists. These values reach a
      // partner in a CSV export we do not control, where a leading `=` executes
      // on open — but a CHECK violation here would cost a family their
      // registration, which is strictly worse than an unattributed one.
      const user = await createTestUser({
        email: "utm-formula@test.local",
        user_metadata: {
          first_name: "Formula",
          last_name: "Payload",
          utm_campaign: "=cmd|'/c calc'!A1",
        },
      });

      const profile = await getProfile(user.id);
      expect(profile.utm_campaign).toBeNull();
      expect(profile.role).toBe("customer");
    });

    it("degrades every formula lead, including one hiding behind a space", async () => {
      // btrim runs before the first-character test, so padding buys nothing.
      const user = await createTestUser({
        email: "utm-formula-leads@test.local",
        user_metadata: {
          first_name: "Formula",
          last_name: "Leads",
          utm_source: "+SUM(A1)",
          utm_medium: "  @SUM(A1)",
          utm_campaign: "-2+3",
        },
      });

      const profile = await getProfile(user.id);
      expect(profile.utm_source).toBeNull();
      expect(profile.utm_medium).toBeNull();
      expect(profile.utm_campaign).toBeNull();
      expect(profile.role).toBe("customer");
    });

    it("degrades a tab-led value to NULL", async () => {
      // The case `btrim` cannot reach: it strips spaces only, so the tab is
      // still the first character when the formula-lead test runs. This is the
      // one refusal that exists purely because the SQL trim is narrower than
      // the TypeScript one.
      const user = await createTestUser({
        email: "utm-tab-led@test.local",
        user_metadata: {
          first_name: "Tab",
          last_name: "Led",
          utm_campaign: String.fromCharCode(9) + "lynx-summer-a",
        },
      });

      expect((await getProfile(user.id)).utm_campaign).toBeNull();
    });

    it("degrades a value carrying a control character to NULL", async () => {
      // A newline inside a campaign name breaks the CSV row it is exported in.
      const user = await createTestUser({
        email: "utm-control@test.local",
        user_metadata: {
          first_name: "Control",
          last_name: "Character",
          utm_campaign: "lynx" + String.fromCharCode(10) + "summer",
        },
      });

      const profile = await getProfile(user.id);
      expect(profile.utm_campaign).toBeNull();
      expect(profile.role).toBe("customer");
    });

    it("degrades an over-200-character value to NULL rather than truncating", async () => {
      const user = await createTestUser({
        email: "utm-long@test.local",
        user_metadata: {
          first_name: "Too",
          last_name: "Long",
          utm_campaign: "a".repeat(201),
        },
      });

      expect((await getProfile(user.id)).utm_campaign).toBeNull();
    });

    it("accepts exactly 200 characters", async () => {
      const user = await createTestUser({
        email: "utm-boundary@test.local",
        user_metadata: {
          first_name: "Exactly",
          last_name: "Twohundred",
          utm_campaign: "a".repeat(200),
        },
      });

      expect((await getProfile(user.id)).utm_campaign).toBe("a".repeat(200));
    });

    it("counts characters, not bytes, at the length boundary", async () => {
      // char_length() counts characters, so 200 multi-byte ones fit where 200
      // bytes' worth would not. The TS sanitiser counts code points for the
      // same reason, and this is the case that keeps the two agreeing.
      const user = await createTestUser({
        email: "utm-multibyte@test.local",
        user_metadata: {
          first_name: "Multi",
          last_name: "Byte",
          utm_campaign: "é".repeat(200),
        },
      });

      expect((await getProfile(user.id)).utm_campaign).toBe("é".repeat(200));
    });

    it("degrades a whitespace-only value to NULL", async () => {
      const user = await createTestUser({
        email: "utm-blank@test.local",
        user_metadata: {
          first_name: "All",
          last_name: "Space",
          utm_campaign: "   ",
        },
      });

      expect((await getProfile(user.id)).utm_campaign).toBeNull();
    });

    it("yields NULL when the keys are absent entirely", async () => {
      const user = await createTestUser({
        email: "utm-absent@test.local",
        user_metadata: { first_name: "No", last_name: "Attribution" },
      });

      const profile = await getProfile(user.id);
      expect(profile.utm_source).toBeNull();
      expect(profile.utm_medium).toBeNull();
      expect(profile.utm_campaign).toBeNull();
    });

    it("refuses one field without touching the other two", async () => {
      // The three predicates are written out separately in the migration, so
      // this is what proves a refusal in one is not a refusal in all — and
      // that the three copies did not drift into each other's columns.
      const user = await createTestUser({
        email: "utm-independent@test.local",
        user_metadata: {
          first_name: "Partly",
          last_name: "Attributed",
          utm_source: "lynx",
          utm_medium: "=SUM(A1)",
          utm_campaign: "lynx-summer-a",
        },
      });

      const profile = await getProfile(user.id);
      expect(profile.utm_source).toBe("lynx");
      expect(profile.utm_medium).toBeNull();
      expect(profile.utm_campaign).toBe("lynx-summer-a");
    });

    it("still cannot influence the assigned role", async () => {
      // The suite's standing subject, re-run against the keys 00234 added:
      // three more caller-supplied values reaching the most sensitive function
      // in the schema must widen nothing but three nullable text columns.
      const user = await createTestUser({
        email: "utm-escalation@test.local",
        user_metadata: {
          first_name: "Sneaky",
          last_name: "Marketer",
          role: "admin",
          utm_campaign: "lynx-summer-a",
        },
      });

      const profile = await getProfile(user.id);
      expect(profile.role).toBe("customer");
      expect(profile.utm_campaign).toBe("lynx-summer-a");
    });
  });
});

/**
 * The three `profiles.utm_*` columns are immutable provenance, which in this
 * schema means exactly one thing: there is no UPDATE grant on any of them, at
 * any level, for either Data API role. The authorization spine pins the *set* of
 * updatable profile columns by exact equality, so a column with no grant
 * produces no failure there either way — this is the positive assertion that
 * the acceptance criterion "an authenticated user cannot alter their own
 * attribution" is met rather than merely implied by an absence.
 *
 * Note this is not an IDOR case: the row under attack is the caller's *own*.
 * The grant is the only thing standing between a user and rewriting their own
 * attribution, which is the whole reason these values are written by the trigger
 * instead of by the client the way `home_location_id` is. It is also what keeps
 * a service-role null path open if counsel's answer on writing attribution
 * without consent comes back the other way.
 */
describe("the profiles.utm_* columns are write-once", () => {
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
      .update({ utm_source: null, utm_medium: null, utm_campaign: null })
      .eq("id", TEST_IDS.CUSTOMER);
  });

  async function storedUtmOf(userId: string) {
    const { data, error } = await admin
      .from("profiles")
      .select("utm_source,utm_medium,utm_campaign")
      .eq("id", userId)
      .single();

    expect(error).toBeNull();
    return data!;
  }

  // 42501 = insufficient_privilege. The absence of a column grant fails the
  // statement outright rather than scoping it, which is why these assert an
  // error where the home-location IDOR case asserts an untouched row.
  it("a parent cannot set their own attribution, on any of the three", async () => {
    // Written out rather than looped: a computed key widens the update payload
    // to `Record<string, string>`, which the generated client rejects, and the
    // three statements are the point of the test anyway.
    const source = await customerClient
      .from("profiles")
      .update({ utm_source: "self-awarded" })
      .eq("id", TEST_IDS.CUSTOMER);
    expect(source.error?.code).toBe("42501");

    const medium = await customerClient
      .from("profiles")
      .update({ utm_medium: "self-awarded" })
      .eq("id", TEST_IDS.CUSTOMER);
    expect(medium.error?.code).toBe("42501");

    const campaign = await customerClient
      .from("profiles")
      .update({ utm_campaign: "self-awarded" })
      .eq("id", TEST_IDS.CUSTOMER);
    expect(campaign.error?.code).toBe("42501");

    expect(await storedUtmOf(TEST_IDS.CUSTOMER)).toEqual({
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
    });
  });

  it("a parent cannot clear an attribution an admin can see", async () => {
    await admin
      .from("profiles")
      .update({ utm_campaign: "lynx-summer-a" })
      .eq("id", TEST_IDS.CUSTOMER);

    const { error } = await customerClient
      .from("profiles")
      .update({ utm_campaign: null })
      .eq("id", TEST_IDS.CUSTOMER);

    expect(error?.code).toBe("42501");
    expect((await storedUtmOf(TEST_IDS.CUSTOMER)).utm_campaign).toBe("lynx-summer-a");
  });

  it("the columns are readable — no grant means no WRITE grant", async () => {
    // Without this, every negative above could pass against columns the caller
    // simply cannot see. The layout's profile query selects every column, so a
    // signed-in user reading their own values is expected and accepted.
    await admin
      .from("profiles")
      .update({ utm_campaign: "lynx-summer-a" })
      .eq("id", TEST_IDS.CUSTOMER);

    const { data, error } = await customerClient
      .from("profiles")
      .select("utm_source,utm_medium,utm_campaign")
      .eq("id", TEST_IDS.CUSTOMER)
      .single();

    expect(error).toBeNull();
    expect(data!.utm_campaign).toBe("lynx-summer-a");
  });

  it("the CHECKs are a real backstop for a service-role write", async () => {
    // The trigger degrades a malformed value to NULL, so the constraints should
    // never be reached through any application path — but service_role is the
    // one writer that bypasses it, and the constraints are what keep a hand-run
    // psql statement from storing a payload. 23514 = check_violation.
    const source = await admin
      .from("profiles")
      .update({ utm_source: "=SUM(A1)" })
      .eq("id", TEST_IDS.CUSTOMER);
    expect(source.error?.code).toBe("23514");

    const medium = await admin
      .from("profiles")
      .update({ utm_medium: "=SUM(A1)" })
      .eq("id", TEST_IDS.CUSTOMER);
    expect(medium.error?.code).toBe("23514");

    const campaign = await admin
      .from("profiles")
      .update({ utm_campaign: "=SUM(A1)" })
      .eq("id", TEST_IDS.CUSTOMER);
    expect(campaign.error?.code).toBe("23514");

    // And the leading-space bypass the CHECK closes by testing btrim(v): a
    // service-role write cannot smuggle a formula in behind a space either.
    const { error: paddedError } = await admin
      .from("profiles")
      .update({ utm_campaign: " =SUM(A1)" })
      .eq("id", TEST_IDS.CUSTOMER);

    expect(paddedError?.code).toBe("23514");

    expect(await storedUtmOf(TEST_IDS.CUSTOMER)).toEqual({
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
    });
  });

  it("the CHECKs refuse a control character and an over-length value too", async () => {
    const { error: controlError } = await admin
      .from("profiles")
      .update({ utm_campaign: "lynx" + String.fromCharCode(10) + "summer" })
      .eq("id", TEST_IDS.CUSTOMER);

    expect(controlError?.code).toBe("23514");

    const { error: longError } = await admin
      .from("profiles")
      .update({ utm_campaign: "a".repeat(201) })
      .eq("id", TEST_IDS.CUSTOMER);

    expect(longError?.code).toBe("23514");
  });
});
