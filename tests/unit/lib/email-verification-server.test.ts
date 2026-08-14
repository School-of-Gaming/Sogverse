import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The token helpers read PIN_COOKIE_SECRET lazily, but set it before the imports
// anyway so nothing can depend on call order.
process.env.PIN_COOKIE_SECRET = "unit-test-pin-secret";

/**
 * `redeemEmailVerificationToken` is the only writer of `profiles.email_verified_at`
 * anywhere in the app, and the column has no UPDATE grant outside the service
 * role — so this function IS the write path, and it runs with no session to fall
 * back on. Everything it refuses, it has to refuse by itself.
 *
 * The admin client is mocked rather than stubbed out: the assertions that matter
 * are about the *statement* it builds, not just the value it returns. In
 * particular, the `.is("email_verified_at", null)` filter is the whole of the
 * idempotence guarantee — a second click must be a no-op, not a rewrite of the
 * date the address was first confirmed — and a mock is the only place a unit test
 * can see it. (What a real database does with a zero-row UPDATE is the DB
 * suite's business; here we prove the predicate is sent at all.)
 */

const supabase = vi.hoisted(() => {
  interface ProfileRow {
    email: string | null;
  }

  const state = {
    /** What the profile read answers. */
    profile: null as ProfileRow | null,
    /** What the conditional update answers. */
    updateError: null as { message: string } | null,
    /** Everything the module actually asked for, in order. */
    tables: [] as string[],
    selectFilters: [] as [string, unknown][],
    updatePayloads: [] as Record<string, unknown>[],
    updateFilters: [] as [string, unknown][],
    isFilters: [] as [string, unknown][],
    clientsCreated: 0,
  };

  function reset() {
    state.profile = null;
    state.updateError = null;
    state.tables = [];
    state.selectFilters = [];
    state.updatePayloads = [];
    state.updateFilters = [];
    state.isFilters = [];
    state.clientsCreated = 0;
  }

  function createAdminClient() {
    state.clientsCreated += 1;
    return {
      from(table: string) {
        state.tables.push(table);
        return {
          select() {
            const read = {
              eq(column: string, value: unknown) {
                state.selectFilters.push([column, value]);
                return read;
              },
              single: async () => ({ data: state.profile, error: null }),
            };
            return read;
          },
          update(payload: Record<string, unknown>) {
            state.updatePayloads.push(payload);
            const write = {
              eq(column: string, value: unknown) {
                state.updateFilters.push([column, value]);
                return write;
              },
              // Terminal on purpose: the chain the module builds ends here, so a
              // future edit that drops the NULL predicate leaves the statement
              // un-awaitable and the isFilters assertions empty.
              is(column: string, value: unknown) {
                state.isFilters.push([column, value]);
                return Promise.resolve({ error: state.updateError });
              },
            };
            return write;
          },
        };
      },
    };
  }

  return { state, reset, createAdminClient };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: supabase.createAdminClient,
}));

import { redeemEmailVerificationToken } from "@/lib/email-verification.server";
import { createEmailVerificationToken } from "@/lib/email-verification";

const USER = "11111111-1111-1111-1111-111111111111";
const EMAIL = "marja@example.com";

beforeEach(() => {
  supabase.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("redeemEmailVerificationToken — the happy path", () => {
  it("stamps an unverified profile and reports it verified", async () => {
    supabase.state.profile = { email: EMAIL };
    const token = await createEmailVerificationToken(USER, EMAIL);

    const before = Date.now();
    const result = await redeemEmailVerificationToken(token);
    const after = Date.now();

    expect(result).toBe("verified");
    expect(supabase.state.tables).toEqual(["profiles", "profiles"]);
    expect(supabase.state.selectFilters).toEqual([["id", USER]]);
    expect(supabase.state.updateFilters).toEqual([["id", USER]]);
    expect(supabase.state.updatePayloads).toHaveLength(1);

    const stamped = supabase.state.updatePayloads[0].email_verified_at;
    expect(typeof stamped).toBe("string");
    const stampedAt = new Date(String(stamped)).getTime();
    expect(stampedAt).toBeGreaterThanOrEqual(before);
    expect(stampedAt).toBeLessThanOrEqual(after);
  });

  /**
   * The link has no expiry and is deliberately not single-use, so the second
   * click — or an inbox scanner pre-fetching it — has to be a successful no-op.
   * The `IS NULL` predicate is what makes it one: the statement is still sent,
   * it just matches nothing, so the original stamp is untouched and no error
   * comes back.
   */
  it("leaves an already-verified profile's original stamp alone", async () => {
    supabase.state.profile = { email: EMAIL };
    const token = await createEmailVerificationToken(USER, EMAIL);

    // First click.
    expect(await redeemEmailVerificationToken(token)).toBe("verified");
    // Second click, against a row that now carries ORIGINAL_STAMP. The write is
    // conditioned on the column being NULL, so it matches zero rows.
    expect(await redeemEmailVerificationToken(token)).toBe("verified");

    expect(
      supabase.state.isFilters,
      "every write must carry the IS NULL predicate, or a repeat click rewrites the date",
    ).toEqual([
      ["email_verified_at", null],
      ["email_verified_at", null],
    ]);
    // Stated the other way round, which is the shape a regression would break:
    // the module never issues an unconditional update.
    expect(supabase.state.isFilters).toHaveLength(
      supabase.state.updatePayloads.length,
    );
  });
});

describe("redeemEmailVerificationToken — everything it refuses", () => {
  it("refuses a missing token without touching the database", async () => {
    expect(await redeemEmailVerificationToken(null)).toBe("invalid");
    expect(await redeemEmailVerificationToken(undefined)).toBe("invalid");
    expect(await redeemEmailVerificationToken("")).toBe("invalid");
    expect(supabase.state.clientsCreated).toBe(0);
  });

  it("refuses a malformed token without touching the database", async () => {
    expect(await redeemEmailVerificationToken("not-a-token")).toBe("invalid");
    expect(await redeemEmailVerificationToken(`${USER}.sig.extra`)).toBe(
      "invalid",
    );
    expect(await redeemEmailVerificationToken(".deadbeef")).toBe("invalid");
    expect(supabase.state.clientsCreated).toBe(0);
  });

  /**
   * A deleted account, or a userId that never existed. The read comes back empty
   * and the signature is never even checked — there is no address to check it
   * against.
   */
  it("refuses a token for a profile that no longer exists", async () => {
    supabase.state.profile = null;
    const token = await createEmailVerificationToken(USER, EMAIL);

    expect(await redeemEmailVerificationToken(token)).toBe("invalid");
    expect(supabase.state.updatePayloads).toEqual([]);
  });

  it("refuses a token for a profile holding no address at all", async () => {
    supabase.state.profile = { email: null };
    const token = await createEmailVerificationToken(USER, EMAIL);

    expect(await redeemEmailVerificationToken(token)).toBe("invalid");
    expect(supabase.state.updatePayloads).toEqual([]);
  });

  /**
   * The case the whole binding exists for: the token was minted for one address
   * and the profile now holds another. Nobody proved the new one, so the link
   * dies on its own — no revocation table, no cleanup job.
   */
  it("refuses a token minted for an address the profile no longer holds", async () => {
    supabase.state.profile = { email: "somebody-else@example.com" };
    const token = await createEmailVerificationToken(USER, EMAIL);

    expect(await redeemEmailVerificationToken(token)).toBe("invalid");
    expect(supabase.state.updatePayloads).toEqual([]);
  });

  it("refuses a token whose signature was tampered with", async () => {
    supabase.state.profile = { email: EMAIL };
    const token = await createEmailVerificationToken(USER, EMAIL);
    const [userId] = token.split(".");

    expect(await redeemEmailVerificationToken(`${userId}.deadbeef`)).toBe(
      "invalid",
    );
    expect(supabase.state.updatePayloads).toEqual([]);
  });

  it("refuses a token pointed at a different account", async () => {
    supabase.state.profile = { email: EMAIL };
    const token = await createEmailVerificationToken(USER, EMAIL);
    const [, signature] = token.split(".");
    const forged = `22222222-2222-2222-2222-222222222222.${signature}`;

    expect(await redeemEmailVerificationToken(forged)).toBe("invalid");
    expect(supabase.state.updatePayloads).toEqual([]);
  });

  /**
   * The one case a false success would be worst: the link is good and the state
   * did not change. Reporting "verified" would tell the reader the job is done
   * and take away the retry that would actually fix it.
   */
  it("never reports success when the write itself failed", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    supabase.state.profile = { email: EMAIL };
    supabase.state.updateError = { message: "connection reset" };
    const token = await createEmailVerificationToken(USER, EMAIL);

    expect(await redeemEmailVerificationToken(token)).toBe("invalid");
    expect(supabase.state.updatePayloads).toHaveLength(1);
    expect(logged).toHaveBeenCalled();
  });
});
