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
 * whom — and that choosing never spends the token, which only the confirm
 * button's POST does.
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

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import LinkDiscordPage from "@/app/[locale]/(auth)/link-discord/page";

/** Next's redirects throw to stop the render; the setup's stub only records. */
class Redirected extends Error {}

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
});

describe("the Discord link page", () => {
  it("sends a signed-out reader to sign in, carrying the token back", async () => {
    mockGetUserWithProfile.mockResolvedValue(null);

    await expect(renderPage("tok-1")).rejects.toBeInstanceOf(Redirected);

    expect(redirect).toHaveBeenCalledWith({
      href: { pathname: "/login", query: { redirect: "/link-discord?token=tok-1" } },
      locale: "en",
    });
  });

  it("refuses a parent or a gamer, with no button", async () => {
    for (const role of ["customer", "gamer"]) {
      signedInAs(role);
      const element = await renderPage("tok-1");
      expect(element?.type).toBe(DiscordLinkRefused);
    }
  });

  it("asks a Gedu or an admin, handing the card the token and the role", async () => {
    for (const role of ["gedu", "admin"]) {
      signedInAs(role);
      const element = await renderPage("tok-1");
      expect(element?.type).toBe(DiscordLinkConfirm);
      expect(element?.props).toEqual({ token: "tok-1", role });
    }
    // Rendering is a read: the token is only spent by the button.
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends a Gedu back to Discord when the address carries no single token", async () => {
    signedInAs("gedu");

    for (const token of [null, "", ["a", "b"]]) {
      const element = await renderPage(token);
      expect(element?.type).toBe(DiscordLinkDead);
      expect(element?.props).toEqual({ reason: "missingToken" });
    }
  });
});
