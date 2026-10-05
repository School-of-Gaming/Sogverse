// @vitest-environment node
//
// Node environment: the card reads a storage Blob into a Buffer, and jsdom's
// Blob is not the undici one.

import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";
import { createTranslator } from "next-intl";
import type { PublicTeamProfileRow } from "@/services/team-profiles/team-profiles.contracts";

// The real catalogs behind a stand-in for the RSC-only `getTranslations`
// (under vitest next-intl resolves to its client build, whose server API
// throws), through next-intl's own translator so `rich` and `markup` behave as
// they do on the server.
vi.mock("next-intl/server", async () => {
  const catalogs = {
    en: (await import("../../messages/en.json")).default,
    fi: (await import("../../messages/fi.json")).default,
  };
  return {
    getTranslations: ({
      locale,
      namespace,
    }: {
      locale: "en" | "fi";
      // The one namespace the card reads.
      namespace: "team.profile";
    }) =>
      createTranslator({ locale, messages: catalogs[locale], namespace }),
  };
});

const mockRpc = vi.fn();
const mockList = vi.fn();
const mockDownload = vi.fn();
const mockCreateClient = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => {
    mockCreateClient(...args);
    return {
      rpc: (name: string, args: unknown) => mockRpc(name, args),
      storage: {
        from: () => ({
          list: (folder: string) => mockList(folder),
          download: (path: string) => mockDownload(path),
        }),
      },
    };
  },
}));

const mockCreateServerClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => mockCreateServerClient(...args),
}));

const { GET } = await import("@/app/opengraph-images/team/[userId]/route");

/**
 * The team member's share card — a route handler drawing one public profile,
 * so an integration test.
 *
 * What is pinned is everything around the picture: the card reads as anon,
 * draws only a public profile and answers 404 for everything else, and is
 * cached for a year at a versioned address and five minutes at one naming no
 * version. The pixels are not asserted (see `og-cards.test.ts`).
 */

const USER_ID = "3c3ca18c-c44b-40df-86f7-98ad3e277aba";

function row(overrides: Partial<PublicTeamProfileRow> = {}): PublicTeamProfileRow {
  return {
    user_id: USER_ID,
    role: "gedu",
    first_name: "Eetu",
    last_name: null,
    nickname: "Creeperhug",
    title: null,
    pick: 13,
    spoken_languages: ["fi", "en"],
    photo_version: "abc",
    translations: [
      {
        locale: "en",
        short_description:
          "I build redstone machines and help shy gamers find their voice.",
        long_description: "About me",
        fun_fact: null,
      },
    ],
    created_at: "2026-01-01T00:00:00+00:00",
    ...overrides,
  };
}

async function photo(format: "jpeg" | "webp"): Promise<Blob> {
  const bytes = await sharp({
    create: { width: 800, height: 1000, channels: 3, background: "#336699" },
  })
    [format]()
    .toBuffer();
  return new Blob([new Uint8Array(bytes)], { type: `image/${format}` });
}

function card(userId: string, query = "?locale=en&v=0123456789abcdef") {
  return GET(
    new Request(`https://sogverse.test/opengraph-images/team/${userId}${query}`),
    { params: Promise.resolve({ userId }) },
  );
}

describe("GET /opengraph-images/team/[userId]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: [row()], error: null });
    mockList.mockResolvedValue({
      data: [{ id: "object-id", name: "4b1f.jpg" }],
      error: null,
    });
    mockDownload.mockResolvedValue({ data: await photo("jpeg"), error: null });
  });

  it("draws a public Gedu's card as a PNG, cached for a year at its versioned address", async () => {
    const response = await card(USER_ID);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it("caches a card asked for without a version for five minutes, with no stale serving", async () => {
    const response = await card(USER_ID, "?locale=en");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=300, s-maxage=300",
    );
    await response.arrayBuffer();
  });

  it("draws a leader's card, and one whose photo is a WebP", async () => {
    mockRpc.mockResolvedValue({
      data: [
        row({
          role: "admin",
          first_name: "Laura",
          last_name: "Virtanen",
          nickname: "Nightowl",
          title: "Head of Clubs",
          pick: null,
        }),
      ],
      error: null,
    });
    mockList.mockResolvedValue({
      data: [{ id: "object-id", name: "4b1f.webp" }],
      error: null,
    });
    mockDownload.mockResolvedValue({ data: await photo("webp"), error: null });

    const response = await card(USER_ID, "?locale=fi");

    expect(response.status).toBe(200);
    // The picture is drawn as the body streams, so a card that cannot be
    // drawn fails here and not at the status.
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it("reads the profile and the photo as anon, never with a cookie-reading client", async () => {
    await card(USER_ID);

    expect(mockCreateServerClient).not.toHaveBeenCalled();
    expect(mockCreateClient).toHaveBeenCalledWith(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      expect.objectContaining({ auth: { persistSession: false } }),
    );
    expect(mockRpc).toHaveBeenCalledWith("get_public_team_profile", {
      p_user_id: USER_ID,
    });
  });

  it("answers 404 for a person whose profile is not public", async () => {
    // Hidden, not approved, not staff and no one all read as no row.
    mockRpc.mockResolvedValue({ data: [], error: null });

    const response = await card(USER_ID);

    expect(response.status).toBe(404);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("answers 404 for anything that is not an id, without asking the database", async () => {
    const response = await card("not-an-id");

    expect(response.status).toBe(404);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("still draws the card when the photo vanished between the two reads", async () => {
    mockList.mockResolvedValue({ data: [], error: null });

    const response = await card(USER_ID);

    expect(response.status).toBe(200);
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  /** The card as drawn with no photo at all: the empty frame. */
  async function emptyFrameCard(): Promise<Buffer> {
    mockList.mockResolvedValueOnce({ data: [], error: null });
    return Buffer.from(await (await card(USER_ID)).arrayBuffer());
  }

  it("draws the empty frame for a photo too large to decode", async () => {
    const expected = await emptyFrameCard();
    // Past the decode bound, though a flat picture is a small file.
    const bytes = await sharp({
      create: { width: 4100, height: 4100, channels: 3, background: "#336699" },
    })
      .jpeg()
      .toBuffer();
    mockDownload.mockResolvedValue({
      data: new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }),
      error: null,
    });

    const response = await card(USER_ID);

    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).equals(expected)).toBe(true);
  });

  it("draws the empty frame for a photo that will not decode", async () => {
    const expected = await emptyFrameCard();
    mockDownload.mockResolvedValue({
      data: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02])], {
        type: "image/jpeg",
      }),
      error: null,
    });

    const response = await card(USER_ID);

    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).equals(expected)).toBe(true);
  });
});
