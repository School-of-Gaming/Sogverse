import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  createAdminTestClient,
  createAnonTestClient,
  createAuthenticatedClient,
} from "./helpers";
import { TEST_CREDENTIALS } from "./constants";

/**
 * forfeit_password() — the password half of a Google claim. When a Google
 * identity proves the address of an account whose address was never
 * verified, the password on it may be a squatter's, so it is set to NULL and
 * the account is left Google-only. What matters is that a password sign-in
 * then fails, that nobody else's password moves, and that nobody but the
 * service role can call it: it bypasses every check on who is asking.
 *
 * Two throwaway users per test rather than seeded ones, because a seeded
 * account whose password was forfeited would fail every later file's sign-in.
 */

const PASSWORD = "testpassword123";
/** The canonical forbidden SQLSTATE a missing grant produces. */
const FORBIDDEN = "42501";

describe("forfeit_password()", () => {
  let admin: SupabaseClient<Database>;
  let target: { id: string; email: string };
  let bystander: { id: string; email: string };

  async function createUser(email: string) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    expect(error).toBeNull();
    if (!data.user) throw new Error(`could not create ${email}`);
    return { id: data.user.id, email };
  }

  /** The error a password sign-in answers with, or null when it succeeds. */
  async function signInError(email: string) {
    const client = createAnonTestClient();
    const { error } = await client.auth.signInWithPassword({
      email,
      password: PASSWORD,
    });
    return error;
  }

  beforeAll(() => {
    admin = createAdminTestClient();
  });

  beforeEach(async () => {
    target = await createUser("forfeit-target@test.local");
    bystander = await createUser("forfeit-bystander@test.local");
  });

  afterEach(async () => {
    for (const user of [target, bystander]) {
      await admin.auth.admin.deleteUser(user.id);
    }
  });

  it("leaves the named user unable to sign in with the password", async () => {
    expect(await signInError(target.email)).toBeNull();

    const { error } = await admin.rpc("forfeit_password", {
      p_user_id: target.id,
    });
    expect(error).toBeNull();

    const refused = await signInError(target.email);
    expect(refused?.code).toBe("invalid_credentials");
  });

  it("touches no other user's password", async () => {
    const { error } = await admin.rpc("forfeit_password", {
      p_user_id: target.id,
    });
    expect(error).toBeNull();

    expect(await signInError(bystander.email)).toBeNull();
  });

  it("raises for an id that names no user", async () => {
    // A v4-shaped id with the reserved variant nibble zeroed: GoTrue never
    // mints one, so it cannot collide with a real or seeded user.
    const { error } = await admin.rpc("forfeit_password", {
      p_user_id: "00000000-0000-4000-0000-000000000000",
    });
    expect(error).not.toBeNull();
  });

  it("refuses anon and authenticated callers, and forfeits nothing", async () => {
    const customer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );

    for (const [role, client] of [
      ["anon", createAnonTestClient()],
      ["authenticated", customer],
    ] as const) {
      const { error } = await client.rpc("forfeit_password", {
        p_user_id: target.id,
      });
      expect(error?.code, `${role} was not refused execute`).toBe(FORBIDDEN);
    }

    expect(await signInError(target.email)).toBeNull();
  });
});
