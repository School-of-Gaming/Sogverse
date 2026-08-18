import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "@/app/api/tools/minecraft-password-reset/route";
import { MINECRAFT_PASSWORD_RESET_MAX_USERNAMES } from "@/services/minecraft-education/minecraft-education.contracts";

function createRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/tools/minecraft-password-reset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockResetPasswords = vi.fn();
vi.mock("@/lib/microsoft-graph", () => ({
  resetPasswords: (...args: unknown[]) => mockResetPasswords(...args),
}));

function authenticated(role: string) {
  mockRequireRole.mockResolvedValue({
    user: { id: `${role}-user-id` },
    profile: { role, first_name: `${role} user` },
    supabase: {},
  });
}

describe("POST /api/tools/minecraft-password-reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResetPasswords.mockResolvedValue([
      { ok: true, upn: "alice@gamer.sog.gg", password: "Sogverse42", forceChange: false },
    ]);
  });

  // -- The gate -------------------------------------------------------------

  it("rejects unauthenticated callers", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const response = await POST(createRequest({ usernames: ["alice"] }));
    expect(response.status).toBe(401);
    expect(mockResetPasswords).not.toHaveBeenCalled();
  });

  it("rejects a role the gate refuses", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const response = await POST(createRequest({ usernames: ["alice"] }));
    expect(response.status).toBe(403);
    expect(mockResetPasswords).not.toHaveBeenCalled();
  });

  it("gates on admin and gedu", async () => {
    authenticated("admin");
    await POST(createRequest({ usernames: ["alice"] }));
    expect(mockRequireRole).toHaveBeenLastCalledWith(
      ["admin", "gedu"],
      expect.any(Object),
    );
  });

  it("requires a certified gedu (the boundary is enforced server-side)", async () => {
    // The uncertified-gedu 403 itself lives in requireRole (covered in
    // tests/unit/lib/auth.test.ts); here we pin that the route opts into that
    // gate, so resetting somebody's password can't become reachable by an
    // unapproved account through a refactor.
    authenticated("gedu");
    await POST(createRequest({ usernames: ["alice"] }));
    expect(mockRequireRole).toHaveBeenLastCalledWith(
      ["admin", "gedu"],
      expect.objectContaining({ requireCertifiedGedu: true }),
    );
  });

  it("returns 403 when requireRole rejects an uncertified gedu", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json(
        {
          error: "Your educator account is awaiting admin certification.",
          code: "GEDU_UNCERTIFIED",
        },
        { status: 403 },
      ),
    );
    const response = await POST(createRequest({ usernames: ["alice"] }));
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("GEDU_UNCERTIFIED");
    expect(mockResetPasswords).not.toHaveBeenCalled();
  });

  // -- Input ----------------------------------------------------------------

  it("rejects an empty username list", async () => {
    authenticated("admin");
    const response = await POST(createRequest({ usernames: [] }));
    expect(response.status).toBe(400);
    expect(mockResetPasswords).not.toHaveBeenCalled();
  });

  it("rejects a username carrying an @ or a space", async () => {
    authenticated("admin");
    for (const bad of ["alice@gamer.sog.gg", "al ice", "   "]) {
      const response = await POST(createRequest({ usernames: [bad] }));
      expect(response.status, bad).toBe(400);
    }
    expect(mockResetPasswords).not.toHaveBeenCalled();
  });

  it("rejects a batch over the cap", async () => {
    authenticated("admin");
    const usernames = Array.from(
      { length: MINECRAFT_PASSWORD_RESET_MAX_USERNAMES + 1 },
      (_, i) => `builder${i}`,
    );
    const response = await POST(createRequest({ usernames }));
    expect(response.status).toBe(400);
    expect(mockResetPasswords).not.toHaveBeenCalled();
  });

  it("accepts a batch exactly at the cap", async () => {
    authenticated("admin");
    const usernames = Array.from(
      { length: MINECRAFT_PASSWORD_RESET_MAX_USERNAMES },
      (_, i) => `builder${i}`,
    );
    mockResetPasswords.mockResolvedValue(
      usernames.map((name) => ({
        ok: true,
        upn: `${name}@gamer.sog.gg`,
        password: "Sogverse01",
        forceChange: false,
      })),
    );
    const response = await POST(createRequest({ usernames }));
    expect(response.status).toBe(200);
  });

  // -- The answer -----------------------------------------------------------

  it("answers one result per username, in input order", async () => {
    authenticated("gedu");
    mockResetPasswords.mockResolvedValue([
      { ok: true, upn: "alice@gamer.sog.gg", password: "Sogverse07", forceChange: false },
      { ok: true, upn: "bob@gedu.sog.gg", password: "Sogverse13", forceChange: true },
      {
        ok: false,
        code: "not_found",
        username: "carol",
        domains: ["gamer.sog.gg", "gedu.sog.gg"],
      },
    ]);

    const response = await POST(
      createRequest({ usernames: ["alice", "bob", "carol"] }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: [
        {
          username: "alice",
          ok: true,
          upn: "alice@gamer.sog.gg",
          password: "Sogverse07",
          forceChange: false,
        },
        {
          username: "bob",
          ok: true,
          upn: "bob@gedu.sog.gg",
          password: "Sogverse13",
          forceChange: true,
        },
        {
          username: "carol",
          ok: false,
          error: {
            code: "not_found",
            username: "carol",
            domains: ["gamer.sog.gg", "gedu.sog.gg"],
          },
        },
      ],
    });
  });

  it("passes the submitted usernames straight to the batch reset", async () => {
    authenticated("admin");
    mockResetPasswords.mockResolvedValue([
      { ok: true, upn: "a@gamer.sog.gg", password: "Sogverse01", forceChange: false },
      { ok: true, upn: "b@gamer.sog.gg", password: "Sogverse02", forceChange: false },
    ]);
    await POST(createRequest({ usernames: ["a", "b"] }));
    // One call for the whole batch — that is what makes the Azure token a
    // once-per-request cost rather than a per-username one.
    expect(mockResetPasswords).toHaveBeenCalledTimes(1);
    expect(mockResetPasswords).toHaveBeenCalledWith(["a", "b"]);
  });

  it("answers 200 with failure rows even when every reset failed", async () => {
    // A failed reset is data the card renders in a row, not a failed request.
    authenticated("admin");
    mockResetPasswords.mockResolvedValue([
      { ok: false, code: "azure_auth" },
      { ok: false, code: "graph_error", status: 503 },
    ]);

    const response = await POST(createRequest({ usernames: ["a", "b"] }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results).toEqual([
      { username: "a", ok: false, error: { code: "azure_auth" } },
      { username: "b", ok: false, error: { code: "graph_error", status: 503 } },
    ]);
  });

  it("never puts a password in the log line", async () => {
    authenticated("admin");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    mockResetPasswords.mockResolvedValue([
      { ok: true, upn: "alice@gamer.sog.gg", password: "Sogverse42", forceChange: false },
    ]);

    await POST(createRequest({ usernames: ["alice"] }));

    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0][0]);
    expect(line).toContain("admin-user-id");
    expect(line).toContain("alice@gamer.sog.gg");
    expect(line).not.toContain("Sogverse42");
    log.mockRestore();
  });
});
