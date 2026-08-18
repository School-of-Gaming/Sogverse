import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GAME_USERNAME_MAX_LENGTH } from "@/lib/constants/game-platforms";
import { lookupMinecraftUser } from "@/lib/mojang";

/**
 * A `fetch` stand-in. A real `Response` rather than a hand-shaped object, so the
 * `.ok`/`.json()` behaviour under test is the platform's and not the mock's.
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

describe("lookupMinecraftUser", () => {
  it("returns the canonical name and a dashed uuid", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ name: "Notch", id: "069a79f444e94726a5befca90e38aaf5" }),
    );

    await expect(lookupMinecraftUser("notch")).resolves.toEqual({
      username: "Notch",
      uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
    });
    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://api.mojang.com/users/profiles/minecraft/notch",
    );
  });

  // The decision, at this layer: Mojang is the only authority on which names
  // exist on Minecraft. Names its *current* rules would refuse are still asked
  // about, because accounts predate those rules — and the ones this lookup used
  // to answer "no" to on Mojang's behalf were real.
  it.each([
    ["a two-character name", "ab"],
    ["a name with a space", "Old Timer"],
    ["a name with a hyphen", "Old-Timer"],
    ["a non-ASCII letter", "Ëlias"],
  ])("asks Mojang about %s rather than answering for it", async (_label, username) => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ name: username, id: "0".repeat(32) }),
    );

    await expect(lookupMinecraftUser(username)).resolves.toEqual({
      username,
      uuid: "00000000-0000-0000-0000-000000000000",
    });
    // The name is encoded on the way out, which is the whole of why no shape
    // rule is needed to put it in a URL.
    expect(mockFetch.mock.calls[0][0]).toBe(
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`,
    );
  });

  // The one refusal left, and it is about our own request rather than about
  // names: an unbounded string must not reach a third party's API, a URL, or a
  // text column.
  it("returns null without calling out for an empty name or one past the length bound", async () => {
    await expect(lookupMinecraftUser("")).resolves.toBeNull();
    await expect(
      lookupMinecraftUser("a".repeat(GAME_USERNAME_MAX_LENGTH + 1)),
    ).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns null when Mojang has no such account", async () => {
    // A miss is a 404 with no body worth parsing.
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));

    await expect(lookupMinecraftUser("definitelynobody")).resolves.toBeNull();
  });

  it("returns null rather than throwing when the fetch itself is rejected", async () => {
    // A Mojang outage must not become a 500 on every write path that saves a
    // username — including gamer creation, where the account has nothing to do
    // with Minecraft.
    mockFetch.mockRejectedValueOnce(new Error("ECONNRESET"));

    await expect(lookupMinecraftUser("Notch")).resolves.toBeNull();
  });

  it("returns null when the payload is not the expected shape", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ name: "Notch" }));

    await expect(lookupMinecraftUser("Notch")).resolves.toBeNull();
  });
});
