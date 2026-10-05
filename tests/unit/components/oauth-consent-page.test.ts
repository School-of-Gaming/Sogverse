import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { redirect as redirectExternal } from "next/navigation";
import { redirect } from "@/i18n/navigation";
import {
  OAuthConsent,
  OAuthConsentRefused,
  OAuthConsentUnavailable,
} from "@/components/oauth-consent/oauth-consent";

/**
 * The consent page gates itself, and the order of its gates is the security
 * property: reading an authorization binds it to the reader and auto-approves a
 * client the reader approved before, so a non-admin must be refused before the
 * page so much as reads it.
 *
 * The page is an async server component; it is awaited and the element it
 * returns inspected, since what is pinned is which card it chose and with what,
 * not how the card renders.
 */

const mockGetUserWithProfile = vi.fn();
const mockGetAuthorizationDetails = vi.fn();
const mockCreateClient = vi.fn(() =>
  Promise.resolve({ auth: { oauth: { getAuthorizationDetails: mockGetAuthorizationDetails } } }),
);

vi.mock("@/lib/supabase/server", () => ({
  getUserWithProfile: () => mockGetUserWithProfile(),
  createClient: () => mockCreateClient(),
}));

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve((key: string) => key),
}));

import OAuthConsentPage from "@/app/[locale]/(auth)/oauth/consent/page";

/** Next's redirects throw to stop the render; the setup's stubs only record. */
class Redirected extends Error {}

const ADMIN = {
  user: { id: "admin-id", email: "admin@example.test" },
  profile: { role: "admin", email: "admin@example.test" },
};

function renderPage(authorizationId: string | string[] | null) {
  return OAuthConsentPage({
    searchParams: Promise.resolve(
      authorizationId === null ? {} : { authorization_id: authorizationId },
    ),
  }) as Promise<ReactElement<Record<string, unknown>> | null>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(redirect).mockImplementation(() => {
    throw new Redirected();
  });
  vi.mocked(redirectExternal).mockImplementation(() => {
    throw new Redirected();
  });
});

describe("the consent page", () => {
  it("sends a signed-out reader to sign in, carrying its whole address back", async () => {
    mockGetUserWithProfile.mockResolvedValue(null);

    await expect(renderPage("auth-1")).rejects.toBeInstanceOf(Redirected);

    expect(redirect).toHaveBeenCalledWith({
      href: {
        pathname: "/login",
        query: { redirect: "/oauth/consent?authorization_id=auth-1" },
      },
      locale: "en",
    });
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockGetAuthorizationDetails).not.toHaveBeenCalled();
  });

  it("refuses a non-admin without ever reading the authorization", async () => {
    mockGetUserWithProfile.mockResolvedValue({
      user: { id: "parent-id", email: "parent@example.test" },
      profile: { role: "customer", email: "parent@example.test" },
    });

    const element = await renderPage("auth-1");

    expect(element?.type).toBe(OAuthConsentRefused);
    expect(element?.props.email).toBe("parent@example.test");
    // The ordering is the property: the read binds the authorization to the
    // reader and auto-approves a client they approved before.
    expect(mockGetAuthorizationDetails).not.toHaveBeenCalled();
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("shows an admin the start-again card when there is no single id", async () => {
    mockGetUserWithProfile.mockResolvedValue(ADMIN);

    for (const id of [null, "", ["a", "b"]]) {
      const element = await renderPage(id);
      expect(element?.type).toBe(OAuthConsentUnavailable);
    }
    expect(mockGetAuthorizationDetails).not.toHaveBeenCalled();
  });

  it("follows an already-approved answer straight to the app's callback", async () => {
    mockGetUserWithProfile.mockResolvedValue(ADMIN);
    const callback = "https://claude.ai/api/mcp/auth_callback?code=c&state=s";
    mockGetAuthorizationDetails.mockResolvedValue({
      data: { redirect_url: callback },
      error: null,
    });

    await expect(renderPage("auth-1")).rejects.toBeInstanceOf(Redirected);

    expect(mockGetAuthorizationDetails).toHaveBeenCalledWith("auth-1");
    expect(redirectExternal).toHaveBeenCalledWith(callback);
  });

  it("never follows an already-approved answer to a script URL", async () => {
    mockGetUserWithProfile.mockResolvedValue(ADMIN);
    mockGetAuthorizationDetails.mockResolvedValue({
      data: { redirect_url: "javascript://x/%0aalert(1)" },
      error: null,
    });

    const element = await renderPage("auth-1");

    expect(element?.type).toBe(OAuthConsentUnavailable);
    expect(redirectExternal).not.toHaveBeenCalled();
  });

  it("shows the start-again card for an authorization Supabase will not describe", async () => {
    mockGetUserWithProfile.mockResolvedValue(ADMIN);
    mockGetAuthorizationDetails.mockResolvedValue({
      data: null,
      error: { message: "authorization not found", status: 404 },
    });

    const element = await renderPage("auth-1");

    expect(element?.type).toBe(OAuthConsentUnavailable);
  });

  it("asks an admin about a pending authorization, leading with where the code goes", async () => {
    mockGetUserWithProfile.mockResolvedValue(ADMIN);
    mockGetAuthorizationDetails.mockResolvedValue({
      data: {
        authorization_id: "auth-1",
        redirect_uri: "https://evil.example/cb",
        client: { name: "Claude" },
        user: { email: "admin@example.test" },
      },
      error: null,
    });

    const element = await renderPage("auth-1");

    expect(element?.type).toBe(OAuthConsent);
    expect(element?.props).toEqual({
      authorizationId: "auth-1",
      clientName: "Claude",
      destination: { display: "evil.example", recognised: false, loopback: false },
      email: "admin@example.test",
    });
  });
});
