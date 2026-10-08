import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";

/**
 * Slack links: the Slack app's pending tokens, `consume_slack_link_token` (the
 * one writer of `slack_links`), and the read policy on the links. The copy of
 * the Discord links for admins alone — an admin links Slack so that the Accept
 * button on an offer acts as them.
 *
 * The seeded admin does the linking; the seeded gedu, customer and gamer are
 * refused.
 */

const FORBIDDEN = "42501";
const NOT_FOUND = "P0032";
const EXPIRED = "P0033";

const TEAM = "TSLACKTEST1";
const SLACK_A = { id: "USLACKTESTA", username: "office.anna" };
const SLACK_B = { id: "USLACKTESTB", username: "office.bertil" };
const SLACK_IDS = [SLACK_A.id, SLACK_B.id];

describe("slack links", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let geduAuth: SupabaseClient<Database>;
  let customerAuth: SupabaseClient<Database>;
  let gamerAuth: SupabaseClient<Database>;

  /** Mints a token the way the Slack webhook does, as the service role. */
  async function mint(
    slack: { id: string; username: string },
    expiresAt?: Date,
  ): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    const { error } = await admin.from("slack_link_tokens").insert({
      token_hash: createHash("sha256").update(token).digest("hex"),
      slack_user_id: slack.id,
      slack_team_id: TEAM,
      slack_username: slack.username,
      ...(expiresAt ? { expires_at: expiresAt.toISOString() } : {}),
    });
    expect(error).toBeNull();
    return token;
  }

  async function linkOf(profileId: string) {
    const { data, error } = await admin
      .from("slack_links")
      .select("*")
      .eq("profile_id", profileId)
      .maybeSingle();
    expect(error).toBeNull();
    return data;
  }

  async function reset(): Promise<void> {
    await admin
      .from("slack_links")
      .delete()
      .in("profile_id", [TEST_IDS.ADMIN, TEST_IDS.GEDU]);
    await admin.from("slack_link_tokens").delete().in("slack_user_id", SLACK_IDS);
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    [adminAuth, geduAuth, customerAuth, gamerAuth] = await Promise.all([
      createAuthenticatedClient(
        TEST_CREDENTIALS.ADMIN.email,
        TEST_CREDENTIALS.ADMIN.password,
      ),
      createAuthenticatedClient(
        TEST_CREDENTIALS.GEDU.email,
        TEST_CREDENTIALS.GEDU.password,
      ),
      createAuthenticatedClient(
        TEST_CREDENTIALS.CUSTOMER.email,
        TEST_CREDENTIALS.CUSTOMER.password,
      ),
      createAuthenticatedClient(
        TEST_CREDENTIALS.GAMER.email,
        TEST_CREDENTIALS.GAMER.password,
      ),
    ]);
  });

  beforeEach(reset);
  afterAll(reset);

  describe("consuming a token", () => {
    it("links an admin and returns the Slack username", async () => {
      const token = await mint(SLACK_A);
      const { data, error } = await adminAuth.rpc("consume_slack_link_token", {
        p_token: token,
      });
      expect(error).toBeNull();
      expect(data).toBe(SLACK_A.username);
      expect(await linkOf(TEST_IDS.ADMIN)).toMatchObject({
        slack_user_id: SLACK_A.id,
        slack_team_id: TEAM,
        slack_username: SLACK_A.username,
      });
    });

    it.each([
      ["gedu", () => geduAuth, TEST_IDS.GEDU],
      ["customer", () => customerAuth, TEST_IDS.CUSTOMER],
      ["gamer", () => gamerAuth, TEST_IDS.GAMER],
    ] as const)(
      "refuses a %s, and leaves the token unspent",
      async (_role, client, profileId) => {
        const token = await mint(SLACK_A);
        const { error } = await client().rpc("consume_slack_link_token", {
          p_token: token,
        });
        expect(error?.code).toBe(FORBIDDEN);
        expect(await linkOf(profileId)).toBeNull();

        // The refusal spent nothing: an admin can still use the same token.
        const retry = await adminAuth.rpc("consume_slack_link_token", {
          p_token: token,
        });
        expect(retry.error).toBeNull();
      },
    );

    it("refuses an unknown token as not found", async () => {
      const { error } = await adminAuth.rpc("consume_slack_link_token", {
        p_token: randomBytes(32).toString("base64url"),
      });
      expect(error?.code).toBe(NOT_FOUND);
      expect(error?.message).toBe("SLACK_LINK_TOKEN_NOT_FOUND");
      expect(await linkOf(TEST_IDS.ADMIN)).toBeNull();
    });

    it("refuses an expired token as expired, every time it is tried", async () => {
      const token = await mint(SLACK_A, new Date(Date.now() - 1000));
      for (let attempt = 0; attempt < 2; attempt++) {
        const { error } = await adminAuth.rpc("consume_slack_link_token", {
          p_token: token,
        });
        expect(error?.code).toBe(EXPIRED);
        expect(error?.message).toBe("SLACK_LINK_TOKEN_EXPIRED");
      }
      expect(await linkOf(TEST_IDS.ADMIN)).toBeNull();
    });

    it("works once: a second use is not found", async () => {
      const token = await mint(SLACK_A);
      const first = await adminAuth.rpc("consume_slack_link_token", {
        p_token: token,
      });
      expect(first.error).toBeNull();

      const again = await adminAuth.rpc("consume_slack_link_token", {
        p_token: token,
      });
      expect(again.error?.code).toBe(NOT_FOUND);
    });

    it("replaces the caller's own previous link", async () => {
      await adminAuth.rpc("consume_slack_link_token", {
        p_token: await mint(SLACK_A),
      });
      const { data, error } = await adminAuth.rpc("consume_slack_link_token", {
        p_token: await mint(SLACK_B),
      });
      expect(error).toBeNull();
      expect(data).toBe(SLACK_B.username);
      expect(await linkOf(TEST_IDS.ADMIN)).toMatchObject({
        slack_user_id: SLACK_B.id,
        slack_username: SLACK_B.username,
      });
    });
  });

  describe("expired tokens", () => {
    it("are swept when the next token is minted", async () => {
      await mint(SLACK_A, new Date(Date.now() - 1000));
      await mint(SLACK_B);
      const { data, error } = await admin
        .from("slack_link_tokens")
        .select("slack_user_id")
        .in("slack_user_id", SLACK_IDS);
      expect(error).toBeNull();
      expect(data?.map((row) => row.slack_user_id)).toEqual([SLACK_B.id]);
    });
  });

  describe("the tables from the browser", () => {
    it("the token table is closed to every signed-in role", async () => {
      await mint(SLACK_A);
      for (const client of [adminAuth, geduAuth, customerAuth]) {
        const read = await client.from("slack_link_tokens").select("*");
        expect(read.error?.code).toBe(FORBIDDEN);
        const write = await client.from("slack_link_tokens").insert({
          token_hash: "0".repeat(64),
          slack_user_id: SLACK_B.id,
          slack_team_id: TEAM,
          slack_username: SLACK_B.username,
        });
        expect(write.error?.code).toBe(FORBIDDEN);
      }
    });

    it("a link cannot be written directly", async () => {
      const { error } = await adminAuth.from("slack_links").insert({
        profile_id: TEST_IDS.ADMIN,
        slack_user_id: SLACK_A.id,
        slack_team_id: TEAM,
        slack_username: SLACK_A.username,
      });
      expect(error?.code).toBe(FORBIDDEN);
    });

    it("the owner reads their own link and nobody else's; an admin reads every link", async () => {
      await adminAuth.rpc("consume_slack_link_token", {
        p_token: await mint(SLACK_A),
      });
      // Only an admin can link through the RPC, so a non-admin owner's row is
      // written by the service role: the policy is about the owner, not the role.
      const { error: seedError } = await admin.from("slack_links").insert({
        profile_id: TEST_IDS.GEDU,
        slack_user_id: SLACK_B.id,
        slack_team_id: TEAM,
        slack_username: SLACK_B.username,
      });
      expect(seedError).toBeNull();

      const ids = async (client: SupabaseClient<Database>) => {
        const { data, error } = await client
          .from("slack_links")
          .select("profile_id")
          .in("profile_id", [TEST_IDS.ADMIN, TEST_IDS.GEDU]);
        expect(error).toBeNull();
        return (data ?? []).map((row) => row.profile_id).sort();
      };

      expect(await ids(geduAuth)).toEqual([TEST_IDS.GEDU]);
      expect(await ids(adminAuth)).toEqual(
        [TEST_IDS.ADMIN, TEST_IDS.GEDU].sort(),
      );
      expect(await ids(customerAuth)).toEqual([]);
      expect(await ids(gamerAuth)).toEqual([]);
    });
  });
});
