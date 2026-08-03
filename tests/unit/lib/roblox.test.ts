import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isValidRobloxUsername,
  lookupRobloxUser,
  lookupRobloxProfile,
  resolveRobloxAvatarUrl,
} from "@/lib/roblox";

/**
 * A `fetch` stand-in. A real `Response` rather than a hand-shaped object, so the
 * `.ok`/`.json()` behaviour under test is the platform's and not the mock's —
 * including a body that is not JSON, whose `.json()` really rejects.
 */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isValidRobloxUsername", () => {
  // Rule 1 — 3 to 20 characters.
  it("accepts the shortest and longest permitted names", () => {
    expect(isValidRobloxUsername("abc")).toBe(true);
    expect(isValidRobloxUsername("a".repeat(20))).toBe(true);
  });

  it("rejects names outside 3-20 characters", () => {
    expect(isValidRobloxUsername("")).toBe(false);
    expect(isValidRobloxUsername("ab")).toBe(false);
    expect(isValidRobloxUsername("a".repeat(21))).toBe(false);
  });

  // Rule 2 — only a-z, A-Z, 0-9 and _.
  it("accepts letters, digits and the underscore", () => {
    expect(isValidRobloxUsername("Roblox")).toBe(true);
    expect(isValidRobloxUsername("builderman")).toBe(true);
    expect(isValidRobloxUsername("Elias_99")).toBe(true);
    expect(isValidRobloxUsername("123")).toBe(true);
  });

  it("rejects every other character", () => {
    expect(isValidRobloxUsername("Elias-99")).toBe(false);
    expect(isValidRobloxUsername("Elias.99")).toBe(false);
    expect(isValidRobloxUsername("Elias 99")).toBe(false);
    expect(isValidRobloxUsername("Elias!")).toBe(false);
    expect(isValidRobloxUsername("Ëlias")).toBe(false);
  });

  // Rule 3 — at most one underscore.
  it("accepts exactly one underscore and rejects two", () => {
    expect(isValidRobloxUsername("a_b")).toBe(true);
    expect(isValidRobloxUsername("a_b_c")).toBe(false);
    expect(isValidRobloxUsername("a__b")).toBe(false);
  });

  // Rule 4 — never at either end.
  it("rejects a leading or trailing underscore", () => {
    expect(isValidRobloxUsername("_abc")).toBe(false);
    expect(isValidRobloxUsername("abc_")).toBe(false);
    expect(isValidRobloxUsername("___")).toBe(false);
  });
});

describe("lookupRobloxUser", () => {
  it("returns the canonical name, id and display name", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            requestedUsername: "roblox",
            hasVerifiedBadge: true,
            id: 1,
            name: "Roblox",
            displayName: "Roblox",
          },
        ],
      }),
    );

    await expect(lookupRobloxUser("roblox")).resolves.toEqual({
      username: "Roblox",
      userId: 1,
      displayName: "Roblox",
    });

    // The lookup is a POST with the username batched into the body, and banned
    // accounts excluded.
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://users.roblox.com/v1/usernames/users");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      usernames: ["roblox"],
      excludeBannedUsers: true,
    });
  });

  it("treats an empty data array as not found — Roblox answers a miss with 200", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));

    await expect(lookupRobloxUser("definitelynobody")).resolves.toBeNull();
  });

  it("returns null without calling out when the username is malformed", async () => {
    await expect(lookupRobloxUser("_nope_")).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns null on a non-ok response", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ errors: [] }, 429));

    await expect(lookupRobloxUser("Roblox")).resolves.toBeNull();
  });

  it("returns null when the payload is not the expected shape", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [{ id: "not-a-number", name: "Roblox" }] }),
    );

    await expect(lookupRobloxUser("Roblox")).resolves.toBeNull();
  });

  it("returns null when the body is not JSON at all", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("<html>rate limited</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );

    await expect(lookupRobloxUser("Roblox")).resolves.toBeNull();
  });
});

describe("resolveRobloxAvatarUrl", () => {
  it("returns the CDN url for a completed render", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            targetId: 1,
            state: "Completed",
            imageUrl: "https://tr.rbxcdn.com/abc/420/420/AvatarBust/Png",
            version: "TN3",
          },
        ],
      }),
    );

    await expect(resolveRobloxAvatarUrl(1)).resolves.toBe(
      "https://tr.rbxcdn.com/abc/420/420/AvatarBust/Png",
    );
    expect(mockFetch.mock.calls[0][0]).toContain(
      "https://thumbnails.roblox.com/v1/users/avatar-bust?userIds=1",
    );
  });

  it("returns null for a Pending render — the avatar was never generated", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: [{ targetId: 2, state: "Pending", imageUrl: "" }],
      }),
    );

    await expect(resolveRobloxAvatarUrl(2)).resolves.toBeNull();
  });

  it("returns null for a Blocked render — the avatar was moderated", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: [{ targetId: 3, state: "Blocked", imageUrl: "" }],
      }),
    );

    await expect(resolveRobloxAvatarUrl(3)).resolves.toBeNull();
  });

  it("returns null when the state claims Completed but the url is empty", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: [{ targetId: 4, state: "Completed", imageUrl: "" }],
      }),
    );

    await expect(resolveRobloxAvatarUrl(4)).resolves.toBeNull();
  });

  it("returns null on an empty data array, a non-ok status, and a rejected fetch", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));
    await expect(resolveRobloxAvatarUrl(5)).resolves.toBeNull();

    mockFetch.mockResolvedValueOnce(jsonResponse({ errors: [] }, 429));
    await expect(resolveRobloxAvatarUrl(5)).resolves.toBeNull();

    mockFetch.mockRejectedValueOnce(new Error("ECONNRESET"));
    await expect(resolveRobloxAvatarUrl(5)).resolves.toBeNull();
  });
});

describe("lookupRobloxProfile", () => {
  it("resolves the account and its avatar in one call", async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: 156, name: "builderman", displayName: "builderman" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              targetId: 156,
              state: "Completed",
              imageUrl: "https://tr.rbxcdn.com/xyz/420/420/AvatarBust/Png",
            },
          ],
        }),
      );

    await expect(lookupRobloxProfile("BUILDERMAN")).resolves.toEqual({
      username: "builderman",
      userId: 156,
      displayName: "builderman",
      avatarUrl: "https://tr.rbxcdn.com/xyz/420/420/AvatarBust/Png",
    });
  });

  it("still resolves the profile when the avatar is unavailable", async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: 7, name: "NoPicture", displayName: "No Picture" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ targetId: 7, state: "Blocked", imageUrl: "" }],
        }),
      );

    await expect(lookupRobloxProfile("NoPicture")).resolves.toEqual({
      username: "NoPicture",
      userId: 7,
      displayName: "No Picture",
      avatarUrl: null,
    });
  });

  it("does not reach the thumbnail service when there is no account", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));

    await expect(lookupRobloxProfile("definitelynobody")).resolves.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
