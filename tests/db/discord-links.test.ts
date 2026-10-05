import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";

/**
 * Discord links: the bot's pending tokens, `consume_discord_link_token` (the
 * one writer of `discord_links`), and the read policy on the links.
 *
 * The seeded admin and Gedu do the linking. Between them they are also the
 * case the model exists for: one person holding an admin and a Gedu account
 * links the same Discord user to both.
 */

const FORBIDDEN = "42501";
const NOT_FOUND = "P0029";
const EXPIRED = "P0030";

const DISCORD_A = { id: "900000000000000001", username: "creeperhug" };
const DISCORD_B = { id: "900000000000000002", username: "redstone_nerd" };
const DISCORD_IDS = [DISCORD_A.id, DISCORD_B.id];

describe("discord links", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let geduAuth: SupabaseClient<Database>;
  let customerAuth: SupabaseClient<Database>;
  let gamerAuth: SupabaseClient<Database>;

  /** Mints a token the way the bot's webhook does, as the service role. */
  async function mint(
    discord: { id: string; username: string },
    expiresAt?: Date,
  ): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    const { error } = await admin.from("discord_link_tokens").insert({
      token_hash: createHash("sha256").update(token).digest("hex"),
      discord_user_id: discord.id,
      discord_username: discord.username,
      ...(expiresAt ? { expires_at: expiresAt.toISOString() } : {}),
    });
    expect(error).toBeNull();
    return token;
  }

  async function linkOf(profileId: string) {
    const { data, error } = await admin
      .from("discord_links")
      .select("*")
      .eq("profile_id", profileId)
      .maybeSingle();
    expect(error).toBeNull();
    return data;
  }

  async function reset(): Promise<void> {
    await admin
      .from("discord_links")
      .delete()
      .in("profile_id", [TEST_IDS.ADMIN, TEST_IDS.GEDU]);
    await admin
      .from("discord_link_tokens")
      .delete()
      .in("discord_user_id", DISCORD_IDS);
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
    it("links a Gedu and returns the Discord username", async () => {
      const token = await mint(DISCORD_A);
      const { data, error } = await geduAuth.rpc("consume_discord_link_token", {
        p_token: token,
      });
      expect(error).toBeNull();
      expect(data).toBe(DISCORD_A.username);
      expect(await linkOf(TEST_IDS.GEDU)).toMatchObject({
        discord_user_id: DISCORD_A.id,
        discord_username: DISCORD_A.username,
      });
    });

    it("links an admin", async () => {
      const token = await mint(DISCORD_A);
      const { data, error } = await adminAuth.rpc(
        "consume_discord_link_token",
        { p_token: token },
      );
      expect(error).toBeNull();
      expect(data).toBe(DISCORD_A.username);
      expect((await linkOf(TEST_IDS.ADMIN))?.discord_user_id).toBe(
        DISCORD_A.id,
      );
    });

    it.each([
      ["customer", () => customerAuth, TEST_IDS.CUSTOMER],
      ["gamer", () => gamerAuth, TEST_IDS.GAMER],
    ] as const)(
      "refuses a %s, and leaves the token unspent",
      async (_role, client, profileId) => {
        const token = await mint(DISCORD_A);
        const { error } = await client().rpc("consume_discord_link_token", {
          p_token: token,
        });
        expect(error?.code).toBe(FORBIDDEN);
        expect(await linkOf(profileId)).toBeNull();

        // The refusal spent nothing: a Gedu can still use the same token.
        const retry = await geduAuth.rpc("consume_discord_link_token", {
          p_token: token,
        });
        expect(retry.error).toBeNull();
      },
    );

    it("refuses an unknown token as not found", async () => {
      const { error } = await geduAuth.rpc("consume_discord_link_token", {
        p_token: randomBytes(32).toString("base64url"),
      });
      expect(error?.code).toBe(NOT_FOUND);
      expect(error?.message).toBe("DISCORD_LINK_TOKEN_NOT_FOUND");
      expect(await linkOf(TEST_IDS.GEDU)).toBeNull();
    });

    it("refuses an expired token as expired, every time it is tried", async () => {
      const token = await mint(DISCORD_A, new Date(Date.now() - 1000));
      for (let attempt = 0; attempt < 2; attempt++) {
        const { error } = await geduAuth.rpc("consume_discord_link_token", {
          p_token: token,
        });
        expect(error?.code).toBe(EXPIRED);
        expect(error?.message).toBe("DISCORD_LINK_TOKEN_EXPIRED");
      }
      expect(await linkOf(TEST_IDS.GEDU)).toBeNull();
    });

    it("works once: a second use is not found", async () => {
      const token = await mint(DISCORD_A);
      const first = await geduAuth.rpc("consume_discord_link_token", {
        p_token: token,
      });
      expect(first.error).toBeNull();

      const again = await adminAuth.rpc("consume_discord_link_token", {
        p_token: token,
      });
      expect(again.error?.code).toBe(NOT_FOUND);
      expect(await linkOf(TEST_IDS.ADMIN)).toBeNull();
    });

    it("replaces the caller's own previous link", async () => {
      await geduAuth.rpc("consume_discord_link_token", {
        p_token: await mint(DISCORD_A),
      });
      const { data, error } = await geduAuth.rpc(
        "consume_discord_link_token",
        { p_token: await mint(DISCORD_B) },
      );
      expect(error).toBeNull();
      expect(data).toBe(DISCORD_B.username);
      expect(await linkOf(TEST_IDS.GEDU)).toMatchObject({
        discord_user_id: DISCORD_B.id,
        discord_username: DISCORD_B.username,
      });
    });

    it("lets two profiles hold the same Discord user, and leaves the first alone", async () => {
      await geduAuth.rpc("consume_discord_link_token", {
        p_token: await mint(DISCORD_A),
      });
      const { error } = await adminAuth.rpc("consume_discord_link_token", {
        p_token: await mint(DISCORD_A),
      });
      expect(error).toBeNull();
      expect((await linkOf(TEST_IDS.GEDU))?.discord_user_id).toBe(
        DISCORD_A.id,
      );
      expect((await linkOf(TEST_IDS.ADMIN))?.discord_user_id).toBe(
        DISCORD_A.id,
      );
    });
  });

  describe("expired tokens", () => {
    it("are swept when the next token is minted", async () => {
      await mint(DISCORD_A, new Date(Date.now() - 1000));
      await mint(DISCORD_B);
      const { data, error } = await admin
        .from("discord_link_tokens")
        .select("discord_user_id")
        .in("discord_user_id", DISCORD_IDS);
      expect(error).toBeNull();
      expect(data?.map((row) => row.discord_user_id)).toEqual([DISCORD_B.id]);
    });
  });

  describe("the tables from the browser", () => {
    it("the token table is closed to every signed-in role", async () => {
      await mint(DISCORD_A);
      for (const client of [adminAuth, geduAuth, customerAuth]) {
        const read = await client.from("discord_link_tokens").select("*");
        expect(read.error?.code).toBe(FORBIDDEN);
        const write = await client.from("discord_link_tokens").insert({
          token_hash: "0".repeat(64),
          discord_user_id: DISCORD_B.id,
          discord_username: DISCORD_B.username,
        });
        expect(write.error?.code).toBe(FORBIDDEN);
      }
    });

    it("a link cannot be written directly", async () => {
      const { error } = await geduAuth.from("discord_links").insert({
        profile_id: TEST_IDS.GEDU,
        discord_user_id: DISCORD_A.id,
        discord_username: DISCORD_A.username,
      });
      expect(error?.code).toBe(FORBIDDEN);
    });

    it("the owner reads their own link and nobody else's; an admin reads every link", async () => {
      await geduAuth.rpc("consume_discord_link_token", {
        p_token: await mint(DISCORD_A),
      });
      await adminAuth.rpc("consume_discord_link_token", {
        p_token: await mint(DISCORD_B),
      });

      const ids = async (client: SupabaseClient<Database>) => {
        const { data, error } = await client
          .from("discord_links")
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
