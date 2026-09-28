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
 * end_every_session() — signing one account out of every device, for the admin
 * route that moves an account's sign-in address. GoTrue's own sign-out only
 * ends the sessions of the token asking, and an admin holds no token of the
 * account being corrected. What matters is that every refresh token of the
 * named user stops working, that the auth server refuses an access token
 * already issued, that nobody else is signed out, and that nobody but the
 * service role can call it: it bypasses every check on who is asking.
 *
 * Throwaway users rather than seeded ones, because ending a seeded account's
 * sessions mid-run would sign out any other file holding one.
 */

const PASSWORD = "testpassword123";
/** The canonical forbidden SQLSTATE a missing grant produces. */
const FORBIDDEN = "42501";

describe("end_every_session()", () => {
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

  /** A signed-in session of the user: the client and its two tokens. */
  async function signIn(email: string) {
    const client = createAnonTestClient();
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password: PASSWORD,
    });
    expect(error).toBeNull();
    if (!data.session) throw new Error(`no session for ${email}`);
    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    };
  }

  /** Whether the auth server still honours the session's tokens. */
  async function sessionAlive(session: {
    accessToken: string;
    refreshToken: string;
  }) {
    const client = createAnonTestClient();
    const { error: userError } = await client.auth.getUser(session.accessToken);
    const { error: refreshError } = await client.auth.refreshSession({
      refresh_token: session.refreshToken,
    });
    return { access: userError === null, refresh: refreshError === null };
  }

  beforeAll(() => {
    admin = createAdminTestClient();
  });

  beforeEach(async () => {
    target = await createUser("end-sessions-target@test.local");
    bystander = await createUser("end-sessions-bystander@test.local");
  });

  afterEach(async () => {
    for (const user of [target, bystander]) {
      await admin.auth.admin.deleteUser(user.id);
    }
  });

  it("ends every session the named user holds, on every device", async () => {
    const first = await signIn(target.email);
    const second = await signIn(target.email);

    const { error } = await admin.rpc("end_every_session", {
      p_user_id: target.id,
    });
    expect(error).toBeNull();

    for (const session of [first, second]) {
      expect(await sessionAlive(session)).toEqual({
        access: false,
        refresh: false,
      });
    }
  });

  it("leaves the password alone, so the user can sign straight back in", async () => {
    await signIn(target.email);

    const { error } = await admin.rpc("end_every_session", {
      p_user_id: target.id,
    });
    expect(error).toBeNull();

    await signIn(target.email);
  });

  it("signs nobody else out", async () => {
    await signIn(target.email);
    const other = await signIn(bystander.email);

    const { error } = await admin.rpc("end_every_session", {
      p_user_id: target.id,
    });
    expect(error).toBeNull();

    expect(await sessionAlive(other)).toEqual({ access: true, refresh: true });
  });

  it("raises for an id that names no user", async () => {
    // A v4-shaped id with the reserved variant nibble zeroed: GoTrue never
    // mints one, so it cannot collide with a real or seeded user.
    const { error } = await admin.rpc("end_every_session", {
      p_user_id: "00000000-0000-4000-0000-000000000000",
    });
    expect(error).not.toBeNull();
  });

  it("refuses anon and authenticated callers, and ends nothing", async () => {
    const session = await signIn(target.email);
    const customer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );

    for (const [role, client] of [
      ["anon", createAnonTestClient()],
      ["authenticated", customer],
    ] as const) {
      const { error } = await client.rpc("end_every_session", {
        p_user_id: target.id,
      });
      expect(error?.code, `${role} was not refused execute`).toBe(FORBIDDEN);
    }

    // Checked by access token alone: a refresh would rotate the token and
    // prove nothing more.
    const { error: userError } = await createAnonTestClient().auth.getUser(
      session.accessToken,
    );
    expect(userError).toBeNull();
  });
});
