import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/roblox/avatars/route";
import { ROBLOX_THUMBNAIL_BATCH_MAX } from "@/lib/roblox";

/**
 * The load-time render path: ids in, CDN URLs out.
 *
 * What is worth protecting here is not the happy path — it is the two properties
 * that make the route affordable and safe to leave mounted on every page. It
 * must stay behind a session (an open thumbnail proxy would drain a per-IP
 * bucket the whole fleet shares), and it must answer for *every* id it was
 * asked about, including the ones with no picture, so a caller can tell "there
 * is none" from "not yet" and stop waiting.
 */

const mockGetClaims = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({ auth: { getClaims: () => mockGetClaims() } }),
}));

// Only the upstream call is replaced; the query schema's parsing and the
// per-id assembly are the real ones.
const mockResolveRobloxRenders = vi.fn();
vi.mock("@/lib/roblox", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/roblox")>();
  return {
    ...actual,
    resolveRobloxRenders: (...args: unknown[]) =>
      mockResolveRobloxRenders(...args),
  };
});

function createRequest(userIds?: string, figures?: string): Request {
  const params = new URLSearchParams();
  if (userIds !== undefined) params.set("userIds", userIds);
  if (figures !== undefined) params.set("figures", figures);
  const query = params.toString();
  return new Request(
    `http://localhost:3000/api/roblox/avatars${query ? `?${query}` : ""}`,
    { method: "GET" },
  );
}

function mockAuthenticated() {
  mockGetClaims.mockResolvedValue({
    data: { claims: { sub: "user-123", email: "user@example.com" } },
    error: null,
  });
}

function renders(entries: Record<number, { avatarUrl: string | null; headshotUrl: string | null }>) {
  return new Map(
    Object.entries(entries).map(([id, urls]) => [Number(id), urls]),
  );
}

const BUST = "https://tr.rbxcdn.com/abc/180/180/AvatarBust/Png";
const HEAD = "https://tr.rbxcdn.com/abc/100/100/AvatarHeadshot/Png";

describe("GET /api/roblox/avatars", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -- Auth --

  it("returns 401 without a session — it is not a free thumbnail proxy", async () => {
    mockGetClaims.mockResolvedValue({ data: null, error: null });

    const response = await GET(createRequest("156"));

    expect(response.status).toBe(401);
    expect(mockResolveRobloxRenders).not.toHaveBeenCalled();
  });

  it("answers any signed-in caller, whatever their role", async () => {
    // The route reads no Sogverse row, so there is no role that is more
    // entitled to an answer — the session is the whole gate.
    mockAuthenticated();
    mockResolveRobloxRenders.mockResolvedValue(
      renders({ 156: { avatarUrl: BUST, headshotUrl: HEAD } }),
    );

    const response = await GET(createRequest("156"));
    expect(response.status).toBe(200);
  });

  // -- Input --

  it("returns 400 when userIds is missing", async () => {
    mockAuthenticated();

    const response = await GET(createRequest());

    expect(response.status).toBe(400);
    expect(mockResolveRobloxRenders).not.toHaveBeenCalled();
  });

  it.each(["", "abc", "12abc", "0", "-4", "1.5", "156,abc"])(
    "returns 400 for %o, which is not a list of account ids",
    async (bad) => {
      mockAuthenticated();

      const response = await GET(createRequest(bad));

      expect(response.status).toBe(400);
      expect(mockResolveRobloxRenders).not.toHaveBeenCalled();
    },
  );

  it("refuses more ids than one upstream request may carry", async () => {
    mockAuthenticated();
    const tooMany = Array.from(
      { length: ROBLOX_THUMBNAIL_BATCH_MAX + 1 },
      (_, i) => i + 1,
    ).join(",");

    const response = await GET(createRequest(tooMany));

    // Refused rather than truncated: a half-answered roster is worse than an
    // error, because the missing rows look like accounts with no avatar.
    expect(response.status).toBe(400);
    expect(mockResolveRobloxRenders).not.toHaveBeenCalled();
  });

  it("accepts exactly the maximum", async () => {
    mockAuthenticated();
    const ids = Array.from(
      { length: ROBLOX_THUMBNAIL_BATCH_MAX },
      (_, i) => i + 1,
    );
    mockResolveRobloxRenders.mockResolvedValue(
      renders(
        Object.fromEntries(
          ids.map((id) => [id, { avatarUrl: null, headshotUrl: null }]),
        ),
      ),
    );

    const response = await GET(createRequest(ids.join(",")));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(Object.keys(data.renders)).toHaveLength(ROBLOX_THUMBNAIL_BATCH_MAX);
  });

  it("collapses duplicate ids before spending a request on them", async () => {
    mockAuthenticated();
    mockResolveRobloxRenders.mockResolvedValue(
      renders({ 156: { avatarUrl: BUST, headshotUrl: HEAD } }),
    );

    const response = await GET(createRequest("156,156, 156"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockResolveRobloxRenders).toHaveBeenCalledWith([156], ["full"]);
    expect(Object.keys(data.renders)).toEqual(["156"]);
  });

  it("caps on what was SENT, not on what survives deduping", async () => {
    // A repeated id still costs the request a parse. Capping the deduped set
    // would let an arbitrarily long query string through as long as it repeated
    // itself — a cap that is supposed to bound the work, not bounding it.
    mockAuthenticated();
    const repeated = Array.from(
      { length: ROBLOX_THUMBNAIL_BATCH_MAX + 1 },
      () => "156",
    ).join(",");

    const response = await GET(createRequest(repeated));

    expect(response.status).toBe(400);
    expect(mockResolveRobloxRenders).not.toHaveBeenCalled();
  });

  // -- Figures --

  it("asks for the full figure alone when none is named", async () => {
    // The default is the cheap one on purpose: one upstream request rather than
    // two, and every surface drawing a stored account today draws this figure.
    mockAuthenticated();
    mockResolveRobloxRenders.mockResolvedValue(
      renders({ 156: { avatarUrl: BUST, headshotUrl: null } }),
    );

    await GET(createRequest("156"));

    expect(mockResolveRobloxRenders).toHaveBeenCalledWith([156], ["full"]);
  });

  it("passes through the figures a caller names", async () => {
    mockAuthenticated();
    mockResolveRobloxRenders.mockResolvedValue(
      renders({ 156: { avatarUrl: BUST, headshotUrl: HEAD } }),
    );

    await GET(createRequest("156", "full,head"));

    expect(mockResolveRobloxRenders).toHaveBeenCalledWith(
      [156],
      ["full", "head"],
    );
  });

  it("accepts the head alone", async () => {
    mockAuthenticated();
    mockResolveRobloxRenders.mockResolvedValue(
      renders({ 156: { avatarUrl: null, headshotUrl: HEAD } }),
    );

    const response = await GET(createRequest("156", "head"));

    expect(response.status).toBe(200);
    expect(mockResolveRobloxRenders).toHaveBeenCalledWith([156], ["head"]);
  });

  it("collapses a figure named twice", async () => {
    mockAuthenticated();
    mockResolveRobloxRenders.mockResolvedValue(
      renders({ 156: { avatarUrl: BUST, headshotUrl: null } }),
    );

    await GET(createRequest("156", "full,full"));

    expect(mockResolveRobloxRenders).toHaveBeenCalledWith([156], ["full"]);
  });

  it.each(["body", "FULL", "full,body", "0"])(
    "returns 400 for figures=%o",
    async (bad) => {
      mockAuthenticated();

      const response = await GET(createRequest("156", bad));

      expect(response.status).toBe(400);
      expect(mockResolveRobloxRenders).not.toHaveBeenCalled();
    },
  );

  it("treats an empty figures param as unset rather than as an error", async () => {
    mockAuthenticated();
    mockResolveRobloxRenders.mockResolvedValue(
      renders({ 156: { avatarUrl: BUST, headshotUrl: null } }),
    );

    const response = await GET(createRequest("156", ""));

    expect(response.status).toBe(200);
    expect(mockResolveRobloxRenders).toHaveBeenCalledWith([156], ["full"]);
  });

  // -- Answers --

  it("returns both renders for one id", async () => {
    mockAuthenticated();
    mockResolveRobloxRenders.mockResolvedValue(
      renders({ 156: { avatarUrl: BUST, headshotUrl: HEAD } }),
    );

    const response = await GET(createRequest("156"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.renders["156"]).toEqual({ avatarUrl: BUST, headshotUrl: HEAD });
  });

  it("answers many ids in one call — the shape a roster needs", async () => {
    mockAuthenticated();
    mockResolveRobloxRenders.mockResolvedValue(
      renders({
        156: { avatarUrl: BUST, headshotUrl: HEAD },
        1: { avatarUrl: null, headshotUrl: HEAD },
        68306362: { avatarUrl: BUST, headshotUrl: null },
      }),
    );

    const response = await GET(createRequest("156,1,68306362"));
    const data = await response.json();

    expect(response.status).toBe(200);
    // One upstream call for the set, not one per id — the whole point.
    expect(mockResolveRobloxRenders).toHaveBeenCalledTimes(1);
    expect(mockResolveRobloxRenders).toHaveBeenCalledWith(
      [156, 1, 68306362],
      ["full"],
    );
    expect(Object.keys(data.renders).sort()).toEqual(
      ["1", "156", "68306362"].sort(),
    );
    // Each figure degrades on its own — they are separate upstream reads.
    expect(data.renders["1"].avatarUrl).toBeNull();
    expect(data.renders["68306362"].headshotUrl).toBeNull();
  });

  it("names every requested id even when the resolver answered for none", async () => {
    // Rate limited, moderated, or simply down: the caller still has to be able
    // to tell "asked, and there is no picture" from "not asked", because only
    // the first means draw the silhouette and stop waiting.
    mockAuthenticated();
    mockResolveRobloxRenders.mockResolvedValue(new Map());

    const response = await GET(createRequest("156,1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.renders).toEqual({
      "156": { avatarUrl: null, headshotUrl: null },
      "1": { avatarUrl: null, headshotUrl: null },
    });
  });
});
