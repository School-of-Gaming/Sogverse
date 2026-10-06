// @vitest-environment node
//
// Node environment: the card reads a storage Blob into a Buffer, and jsdom's
// Blob is not the undici one.

import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";
import { createTranslator } from "next-intl";
import { PREVIEW_IMAGE_BUDGET_BYTES } from "@/lib/images/encode-within-budget.server";
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
 * draws only a public profile and answers 404 for everything else, is
 * cached for five minutes rather than the site cards' year, and is served
 * inside the preview budget whatever photo it carries. The pixels are not
 * asserted (see `og-cards.test.ts`).
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

/**
 * The photo a link preview is hardest on: 800×1000 of seeded random noise,
 * blurred just enough to be a picture. Unblurred noise fits no budget at any
 * quality and is no photo anyone uploads; blurred, it is still far busier than
 * a face, so a card that carries it under budget carries any real portrait.
 * Seeded rather than `Math.random`, so every run draws the same card.
 */
async function noisyPhoto(): Promise<Blob> {
  const width = 800;
  const height = 1000;
  const pixels = Buffer.alloc(width * height * 3);
  // mulberry32: a small, fixed-seed generator.
  let seed = 0x5eed;
  for (let index = 0; index < pixels.length; index++) {
    seed = (seed + 0x6d2b79f5) | 0;
    let mixed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    pixels[index] = (mixed ^ (mixed >>> 14)) & 0xff;
  }
  const bytes = await sharp(pixels, { raw: { width, height, channels: 3 } })
    .blur(1.5)
    .jpeg({ quality: 95 })
    .toBuffer();
  return new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
}

/**
 * The body of a drawn card, after asserting what every card answers: a body
 * no larger than the preview budget, whose `Content-Length` says its size.
 */
async function served(response: Response): Promise<Buffer> {
  expect(response.status).toBe(200);
  const bytes = Buffer.from(await response.arrayBuffer());
  expect(bytes.length).toBeGreaterThan(0);
  expect(bytes.length).toBeLessThanOrEqual(PREVIEW_IMAGE_BUDGET_BYTES);
  expect(response.headers.get("content-length")).toBe(String(bytes.length));
  return bytes;
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

  it("draws a public Gedu's card, cached for five minutes", async () => {
    const response = await card(USER_ID);

    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=300, s-maxage=300",
    );
    await served(response);
  });

  it("keeps a card whose photo is one flat colour as the PNG it was drawn as, since it fits", async () => {
    // The fixture photo is a single colour, so the drawn card is flat colour
    // and text throughout and fits the budget as a PNG. A real photograph is
    // what turns it into a JPEG, which the next case pins.
    const response = await card(USER_ID);

    expect(response.headers.get("content-type")).toBe("image/png");
    await served(response);
  });

  it("carries the busiest photo it can be given inside the preview budget, as a JPEG", async () => {
    mockDownload.mockResolvedValue({ data: await noisyPhoto(), error: null });

    const response = await card(USER_ID);

    expect(response.headers.get("content-type")).toBe("image/jpeg");
    await served(response);
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

    // The picture is drawn as the body streams, so a card that cannot be
    // drawn fails here and not at the status.
    await served(response);
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

  it("still draws the card when the photo vanished between the two reads, as a PNG: an empty frame is flat colour and text", async () => {
    mockList.mockResolvedValue({ data: [], error: null });

    const response = await card(USER_ID);

    expect(response.headers.get("content-type")).toBe("image/png");
    await served(response);
  });

  /** The card as drawn with no photo at all: the empty frame. */
  async function emptyFrameCard(): Promise<Buffer> {
    mockList.mockResolvedValueOnce({ data: [], error: null });
    return served(await card(USER_ID));
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

    expect((await served(response)).equals(expected)).toBe(true);
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

    expect((await served(response)).equals(expected)).toBe(true);
  });
});
