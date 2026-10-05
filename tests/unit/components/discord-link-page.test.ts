import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { redirect } from "@/i18n/navigation";
import {
  DiscordLinkConfirm,
  DiscordLinkDead,
  DiscordLinkRefused,
} from "@/components/discord-link/discord-link";

/**
 * The `/link-discord` page gates itself, because the proxy lets it through to
 * keep the token on the address. What is pinned is which card it chooses for
 * whom; that only a Gedu or an admin causes the token to be looked up, so
 * nobody else learns whose it is; and that the lookup is a read — the token is
 * only spent by the confirm button's POST.
 *
 * The page is an async server component; it is awaited and the element it
 * returns inspected.
 */

const mockGetUserWithProfile = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getUserWithProfile: () => mockGetUserWithProfile(),
}));

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve((key: string) => key),
}));

/** The token row the service-role read finds, or null for none. */
let tokenRow: { discord_username: string; expires_at: string } | null = null;
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockDelete = vi.fn();
const mockRpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom, rpc: mockRpc }),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import LinkDiscordPage from "@/app/[locale]/(auth)/link-discord/page";

/** Next's redirects throw to stop the render; the setup's stub only records. */
class Redirected extends Error {}

const HOUR = 60 * 60 * 1000;

function signedInAs(role: string) {
  mockGetUserWithProfile.mockResolvedValue({
    user: { id: `${role}-id`, email: `${role}@example.test` },
    profile: { role, email: `${role}@example.test` },
  });
}

function renderPage(token: string | string[] | null) {
  return LinkDiscordPage({
    searchParams: Promise.resolve(token === null ? {} : { token }),
  }) as Promise<ReactElement<Record<string, unknown>> | null>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(redirect).mockImplementation(() => {
    throw new Redirected();
  });
  tokenRow = {
    discord_username: "kyle_sog",
    expires_at: new Date(Date.now() + HOUR).toISOString(),
  };
  mockFrom.mockReturnValue({ select: mockSelect, delete: mockDelete });
  mockSelect.mockReturnValue({ eq: mockEq });
  mockEq.mockImplementation(() => ({
    maybeSingle: () => Promise.resolve({ data: tokenRow, error: null }),
  }));
});

describe("the Discord link page", () => {
  it("sends a signed-out reader to sign in, carrying the token back", async () => {
    mockGetUserWithProfile.mockResolvedValue(null);

    await expect(renderPage("tok-1")).rejects.toBeInstanceOf(Redirected);

    expect(redirect).toHaveBeenCalledWith({
      href: { pathname: "/login", query: { redirect: "/link-discord?token=tok-1" } },
      locale: "en",
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("refuses a parent or a gamer, with no button and no token read", async () => {
    for (const role of ["customer", "gamer"]) {
      signedInAs(role);
      const element = await renderPage("tok-1");
      expect(element?.type).toBe(DiscordLinkRefused);
    }
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("asks a Gedu or an admin, naming the Discord account the token would link", async () => {
    for (const role of ["gedu", "admin"]) {
      signedInAs(role);
      const element = await renderPage("tok-1");
      expect(element?.type).toBe(DiscordLinkConfirm);
      expect(element?.props).toEqual({
        token: "tok-1",
        role,
        discordUsername: "kyle_sog",
      });
    }
    // The row is found by the token's hash, the same one the bot stored.
    expect(mockFrom).toHaveBeenCalledWith("discord_link_tokens");
    expect(mockSelect).toHaveBeenCalledWith("discord_username, expires_at");
    expect(mockEq).toHaveBeenCalledWith(
      "token_hash",
      createHash("sha256").update("tok-1").digest("hex"),
    );
  });

  it("never spends the token on a GET", async () => {
    signedInAs("gedu");
    await renderPage("tok-1");

    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("shows the used card, with no button, for a token it cannot find", async () => {
    signedInAs("gedu");
    tokenRow = null;

    const element = await renderPage("tok-1");
    expect(element?.type).toBe(DiscordLinkDead);
    expect(element?.props).toEqual({ reason: "used" });
  });

  it("shows the expired card, with no button, for a token past its time", async () => {
    signedInAs("admin");
    tokenRow = {
      discord_username: "kyle_sog",
      expires_at: new Date(Date.now() - HOUR).toISOString(),
    };

    const element = await renderPage("tok-1");
    expect(element?.type).toBe(DiscordLinkDead);
    expect(element?.props).toEqual({ reason: "expired" });
  });

  it("sends a Gedu back to Discord when the address carries no single token", async () => {
    signedInAs("gedu");

    for (const token of [null, "", ["a", "b"]]) {
      const element = await renderPage(token);
      expect(element?.type).toBe(DiscordLinkDead);
      expect(element?.props).toEqual({ reason: "missingToken" });
    }
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
